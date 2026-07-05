import { describe, expect, it } from "vitest"
import { deriveSummary } from "@/lib/content/markdown"
import { calculateReadingTime } from "@/lib/utils/format"
import { buildPostFile } from "./frontmatter"
import {
	type ExistingPost,
	type ImportFile,
	parsePostFiles,
	planPostImport,
} from "./postImport"

const NOW = "2026-07-04-1200"

const LONG_BODY = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ")

/** A well-formed post file: frontmatter title + body. Filename is decorative. */
function fmFile(filename: string, title: string, body: string): ImportFile {
	return { filename, content: buildPostFile(title, body) }
}

function existing(overrides: Partial<ExistingPost> = {}): ExistingPost {
	const body = "Original body with a handful of words."

	return {
		id: 1,
		title: "Hello world",
		body,
		summary: deriveSummary(body),
		datetime: "2026-01-01-0900",
		readingTime: calculateReadingTime(body),
		...overrides,
	}
}

function existingMap(post: ExistingPost, slug = "hello-world") {
	return new Map([[slug, post]])
}

// #region parsePostFiles

describe("parsePostFiles", () => {
	it("takes the title from frontmatter and the datetime from the filename", () => {
		const { parsed, skipped } = parsePostFiles([
			fmFile("2026-07-24-0937-any-label.md", "The tools", "Body text"),
		])

		expect(skipped).toEqual([])
		expect(parsed).toEqual([
			{
				filename: "2026-07-24-0937-any-label.md",
				title: "The tools",
				slug: "the-tools",
				datetime: "2026-07-24-0937",
				body: "Body text",
			},
		])
	})

	it("derives the slug from the title even when the filename label diverges", () => {
		// The whole point of the frontmatter move: the filename can't hold the
		// real title, so the slug must come from the title, not the label.
		const { parsed } = parsePostFiles([
			fmFile("2013-10-18-0313-debuggex-dot-com.md", "Debuggex.com", "Body"),
		])

		expect(parsed[0]?.title).toBe("Debuggex.com")
		expect(parsed[0]?.slug).toBe("debuggex-com")
	})

	it("defaults a missing time component to 0000", () => {
		const { parsed } = parsePostFiles([
			fmFile("2026-07-24-any-label.md", "The tools", "Body text"),
		])

		expect(parsed[0]?.datetime).toBe("2026-07-24-0000")
	})

	it("skips a malformed filename with the parser's reason", () => {
		const { parsed, skipped } = parsePostFiles([
			fmFile("notes.txt", "The tools", "Body"),
		])

		expect(parsed).toEqual([])
		expect(skipped[0]?.reason).toMatch(/yyyy-MM-dd/)
	})

	it("skips a file with no frontmatter title", () => {
		const { parsed, skipped } = parsePostFiles([
			{
				filename: "2026-07-24-0937-the-tools.md",
				content: "The tools\n\nBody text",
			},
		])

		expect(parsed).toEqual([])
		expect(skipped[0]?.reason).toMatch(/Missing `title:` frontmatter/)
	})

	it("skips a title that produces an empty slug", () => {
		const { skipped } = parsePostFiles([
			fmFile("2026-07-24-punct.md", "!!!", "Body"),
		])

		expect(skipped[0]?.reason).toMatch(/empty slug/)
	})

	it("skips the second file with a duplicate slug", () => {
		const { parsed, skipped } = parsePostFiles([
			fmFile("2026-07-24-a.md", "Same title", "Body one"),
			fmFile("2026-07-25-b.md", "Same title", "Body two"),
		])

		expect(parsed).toHaveLength(1)
		expect(skipped[0]?.reason).toMatch(/Duplicate slug/)
	})

	it("skips a file whose body is empty", () => {
		const { skipped } = parsePostFiles([
			fmFile("2026-07-24-the-tools.md", "The tools", ""),
		])

		expect(skipped[0]?.reason).toMatch(/Body is empty/)
	})
})

// #endregion

// #region planPostImport — creates

describe("planPostImport — creates", () => {
	it("plans a create with derived summary and reading time for a new slug", () => {
		const { parsed } = parsePostFiles([
			fmFile("2026-07-01-0900-fresh.md", "Fresh post", LONG_BODY),
		])

		const plan = planPostImport(parsed, new Map(), {
			section: "tech",
			now: NOW,
			overwrite: false,
		})

		expect(plan.updates).toEqual([])
		expect(plan.skipped).toEqual([])
		expect(plan.creates).toHaveLength(1)

		const create = plan.creates[0]
		expect(create.slug).toBe("fresh-post")
		expect(create.section).toBe("tech")
		expect(create.summary).toBe(deriveSummary(LONG_BODY))
		expect(create.readingTime).toBe(calculateReadingTime(LONG_BODY))
	})

	it("imports future-dated files as published and past-dated as drafts", () => {
		const { parsed } = parsePostFiles([
			fmFile("2026-07-10-0900-scheduled.md", "Scheduled one", "Body text"),
			fmFile("2026-07-01-0900-past.md", "Past one", "Body text"),
		])

		const plan = planPostImport(parsed, new Map(), {
			section: "tech",
			now: NOW,
			overwrite: false,
		})

		const scheduled = plan.creates.find((c) => c.slug === "scheduled-one")
		const past = plan.creates.find((c) => c.slug === "past-one")
		expect(scheduled?.published).toBe(true)
		expect(past?.published).toBe(false)
	})

	it("skips a create that fails the admin schema", () => {
		const { parsed } = parsePostFiles([
			fmFile("2026-07-01-0900-huge.md", "Huge post", "x".repeat(100_001)),
		])

		const plan = planPostImport(parsed, new Map(), {
			section: "tech",
			now: NOW,
			overwrite: false,
		})

		expect(plan.creates).toEqual([])
		expect(plan.skipped[0]?.reason).toMatch(/body/)
	})
})

// #endregion

// #region planPostImport — overwrite

describe("planPostImport — overwrite", () => {
	it("skips an existing slug when overwrite is off", () => {
		const { parsed } = parsePostFiles([
			fmFile("2026-01-01-0900-hello.md", "Hello world", "New body"),
		])

		const plan = planPostImport(parsed, existingMap(existing()), {
			section: "tech",
			now: NOW,
			overwrite: false,
		})

		expect(plan.updates).toEqual([])
		expect(plan.skipped[0]?.reason).toMatch(/--overwrite/)
	})

	it("skips an unchanged file", () => {
		const row = existing()
		const { parsed } = parsePostFiles([
			fmFile("2026-01-01-0900-hello.md", "Hello world", row.body),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(plan.updates).toEqual([])
		expect(plan.skipped[0]?.reason).toBe("Unchanged")
	})

	it("updates body, reading time, and a derived summary on body change", () => {
		const row = existing()
		const { parsed } = parsePostFiles([
			fmFile("2026-01-01-0900-hello.md", "Hello world", LONG_BODY),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(plan.updates).toHaveLength(1)
		const { data } = plan.updates[0]
		expect(data.body).toBe(LONG_BODY)
		expect(data.readingTime).toBe(calculateReadingTime(LONG_BODY))
		expect(data.summary).toBe(deriveSummary(LONG_BODY))
	})

	it("preserves a hand-authored summary when the body changes", () => {
		const row = existing({ summary: "Hand written summary." })
		const { parsed } = parsePostFiles([
			fmFile("2026-01-01-0900-hello.md", "Hello world", LONG_BODY),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(plan.updates[0]?.data.summary).toBeUndefined()
	})

	it("never includes published in an update payload", () => {
		const row = existing()
		const { parsed } = parsePostFiles([
			fmFile("2026-01-01-0900-hello.md", "Hello world", LONG_BODY),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(Object.keys(plan.updates[0]?.data ?? {})).not.toContain("published")
	})

	it("updates only the title when only the title changed", () => {
		const row = existing()
		const { parsed } = parsePostFiles([
			// Title "Hello, world" (comma) → slug "hello-world" matches the row;
			// only the title text differs.
			fmFile("2026-01-01-0900-hello.md", "Hello, world", row.body),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(plan.updates[0]?.data).toEqual({ title: "Hello, world" })
	})

	it("updates only the datetime when only the datetime changed", () => {
		const row = existing()
		const { parsed } = parsePostFiles([
			fmFile("2026-02-02-1000-hello.md", "Hello world", row.body),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(plan.updates[0]?.data).toEqual({ datetime: "2026-02-02-1000" })
	})
})

// #endregion
