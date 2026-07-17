import { describe, expect, it } from "vitest"
import { deriveSummary } from "@/lib/content/markdown"
import { calculateReadingTime } from "@/lib/utils/format"
import { buildPostFile, parseFrontmatter } from "./frontmatter"
import {
	diffBodyLines,
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
				slugRewrite: {
					content: `---\ntitle: "The tools"\nslug: the-tools\n---\n\nBody text`,
					previous: null,
				},
			},
		])
	})

	it("derives the slug from the title even when the filename label diverges", () => {
		// The filename can't hold the real title, so a missing `slug:` derives
		// from the title, not the label.
		const { parsed } = parsePostFiles([
			fmFile("2013-10-18-0313-debuggex-dot-com.md", "Debuggex.com", "Body"),
		])

		expect(parsed[0]?.title).toBe("Debuggex.com")
		expect(parsed[0]?.slug).toBe("debuggex-com")
	})

	it("uses an explicit `slug:` over the title and plans no rewrite", () => {
		const { parsed } = parsePostFiles([
			{
				filename: "2026-07-24-0937-renamed.md",
				content: `---\ntitle: "A much better title"\nslug: the-original-slug\n---\n\nBody.`,
			},
		])

		expect(parsed[0]?.slug).toBe("the-original-slug")
		expect(parsed[0]?.slugRewrite).toBeNull()
	})

	it("normalizes a non-canonical `slug:` and carries the fixed file content", () => {
		const { parsed } = parsePostFiles([
			{
				filename: "2026-07-24-0937-messy.md",
				content: `---\ntitle: "The tools"\nslug: "My Cool Slug"\n---\n\nBody.`,
			},
		])

		expect(parsed[0]?.slug).toBe("my-cool-slug")
		expect(parsed[0]?.slugRewrite).toEqual({
			content: `---\ntitle: "The tools"\nslug: my-cool-slug\n---\n\nBody.`,
			previous: "My Cool Slug",
		})
	})

	it("parses the rewrite content back to the resolved slug", () => {
		const { parsed } = parsePostFiles([
			fmFile("2026-07-24-0937-the-tools.md", "The tools", "Body text"),
		])

		const rewritten = parseFrontmatter(parsed[0]?.slugRewrite?.content ?? "")
		expect(rewritten.slug).toBe("the-tools")
		expect(rewritten.title).toBe("The tools")
		expect(rewritten.body).toBe("Body text")
	})

	it("skips a `slug:` that normalizes to an empty slug", () => {
		const { parsed, skipped } = parsePostFiles([
			{
				filename: "2026-07-24-0937-punct.md",
				content: `---\ntitle: "The tools"\nslug: "!!!"\n---\n\nBody.`,
			},
		])

		expect(parsed).toEqual([])
		expect(skipped[0]?.reason).toMatch(/`slug:` normalizes to an empty slug/)
	})

	it("detects a duplicate between an explicit slug and a derived one", () => {
		const { parsed, skipped } = parsePostFiles([
			fmFile("2026-07-24-a.md", "The tools", "Body one"),
			{
				filename: "2026-07-25-b.md",
				content: `---\ntitle: "Different title"\nslug: the-tools\n---\n\nBody two.`,
			},
		])

		expect(parsed).toHaveLength(1)
		expect(skipped[0]?.reason).toMatch(/Duplicate slug/)
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

	it('treats a blank `slug:` like a missing one: derives from the title, rewrite carries `previous: ""`', () => {
		const { parsed, skipped } = parsePostFiles([
			{
				filename: "2026-07-24-0937-blank.md",
				content: `---\ntitle: "The tools"\nslug:\n---\n\nBody.`,
			},
		])

		expect(skipped).toEqual([])
		expect(parsed[0]?.slug).toBe("the-tools")
		expect(parsed[0]?.slugRewrite?.previous).toBe("")
	})

	it("reports a blank `slug:` distinctly from a missing line when the title is also empty", () => {
		const { skipped } = parsePostFiles([
			{
				filename: "2026-07-24-0937-blank.md",
				content: `---\ntitle: "!!!"\nslug:\n---\n\nBody.`,
			},
		])

		expect(skipped[0]?.reason).toMatch(/`slug:` is blank/)
	})

	// The parsed value trims to the resolved slug, so the old parsed-vs-resolved
	// comparison planned no rewrite and left the trailing space on disk.
	it("plans a rewrite when the on-disk slug differs only by trailing whitespace", () => {
		const { parsed } = parsePostFiles([
			{
				filename: "2026-07-24-0937-spaced.md",
				content: `---\ntitle: "The tools"\nslug: the-tools \n---\n\nBody.`,
			},
		])

		expect(parsed[0]?.slug).toBe("the-tools")
		expect(parsed[0]?.slugRewrite?.content).toBe(
			`---\ntitle: "The tools"\nslug: the-tools\n---\n\nBody.`
		)
	})

	it("preserves CRLF end-to-end when it rewrites the slug", () => {
		const { parsed } = parsePostFiles([
			{
				filename: "2026-07-24-0937-crlf.md",
				content: `---\r\ntitle: "The tools"\r\n---\r\n\r\nBody.`,
			},
		])

		expect(parsed[0]?.slugRewrite?.content).toBe(
			`---\r\ntitle: "The tools"\r\nslug: the-tools\r\n---\r\n\r\nBody.`
		)
	})
})

// #endregion

// #region diffBodyLines

describe("diffBodyLines", () => {
	it("reports a changed line as one removed (DB) and one added (file)", () => {
		const db = "intro\ncontact me @rolandleth\noutro"
		const file = "intro\ncontact me @roland.leth.ro\noutro"

		expect(diffBodyLines(db, file)).toEqual({
			removed: ["contact me @rolandleth"],
			added: ["contact me @roland.leth.ro"],
		})
	})

	it("returns empty arrays for identical bodies", () => {
		expect(diffBodyLines("same\nlines", "same\nlines")).toEqual({
			removed: [],
			added: [],
		})
	})

	it("reports a purely added line", () => {
		expect(diffBodyLines("a\nb", "a\nb\nc")).toEqual({
			removed: [],
			added: ["c"],
		})
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

	// Bodies diverge only past the 160-char summary window, so a still-derived
	// summary resolves to the same text — the body updates, the summary doesn't.
	it("omits the summary from the update when a derived summary is unchanged", () => {
		const shared = Array.from({ length: 40 }, () => "word").join(" ")
		const row = existing({ body: `${shared} alpha` })
		const { parsed } = parsePostFiles([
			fmFile("2026-01-01-0900-hello.md", "Hello world", `${shared} beta`),
		])

		const plan = planPostImport(parsed, existingMap(row), {
			section: "tech",
			now: NOW,
			overwrite: true,
		})

		expect(plan.updates[0]?.data.body).toBe(`${shared} beta`)
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
