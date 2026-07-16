import { describe, expect, it } from "vitest"
import {
	buildPostFile,
	parseFrontmatter,
	setFrontmatterSlug,
} from "./frontmatter"

// #region parseFrontmatter

describe("parseFrontmatter", () => {
	it("reads an always-quoted title and the body after the block", () => {
		const raw = `---\ntitle: "Hello world"\n---\n\nBody text.`

		expect(parseFrontmatter(raw)).toEqual({
			title: "Hello world",
			slug: null,
			body: "Body text.",
		})
	})

	it("reads a title with a colon literally (the whole point over YAML)", () => {
		const raw = `---\ntitle: "Improving the search: highlighted terms"\n---\n\nBody.`

		expect(parseFrontmatter(raw).title).toBe(
			"Improving the search: highlighted terms"
		)
	})

	it("reads a title with brackets and a hash literally", () => {
		const raw = `---\ntitle: "[NJS] Database handling #2"\n---\n\nBody.`

		expect(parseFrontmatter(raw).title).toBe("[NJS] Database handling #2")
	})

	it("tolerates a bare (unquoted) value from a hand-edit", () => {
		const raw = `---\ntitle: Formatters\n---\n\nBody.`

		expect(parseFrontmatter(raw).title).toBe("Formatters")
	})

	it("unescapes an embedded quote", () => {
		const raw = `---\ntitle: "A \\"quoted\\" word"\n---\n\nBody.`

		expect(parseFrontmatter(raw).title).toBe('A "quoted" word')
	})

	it("handles CRLF line endings", () => {
		const raw = `---\r\ntitle: "Hello world"\r\n---\r\n\r\nBody.`

		expect(parseFrontmatter(raw)).toEqual({
			title: "Hello world",
			slug: null,
			body: "Body.",
		})
	})

	it("does not split on a `title:` that appears in the body", () => {
		const raw = `---\ntitle: "Real title"\n---\n\nThe HTML title: element is nice.`

		expect(parseFrontmatter(raw).title).toBe("Real title")
	})

	it("stops at the first closing --- even if the body has one", () => {
		const raw = `---\ntitle: "Real title"\n---\n\nBody\n\n---\n\nMore body.`

		expect(parseFrontmatter(raw)).toEqual({
			title: "Real title",
			slug: null,
			body: "Body\n\n---\n\nMore body.",
		})
	})

	it("returns null title and the raw body when there is no frontmatter", () => {
		const raw = `Just a plain title\n\nBody.`

		expect(parseFrontmatter(raw)).toEqual({
			title: null,
			slug: null,
			body: `Just a plain title\n\nBody.`,
		})
	})

	it("returns null title when the block has no title line", () => {
		const raw = `---\ndate: 2026-01-01\n---\n\nBody.`

		expect(parseFrontmatter(raw)).toEqual({
			title: null,
			slug: null,
			body: "Body.",
		})
	})

	it("returns null title for an empty title value", () => {
		const raw = `---\ntitle: ""\n---\n\nBody.`

		expect(parseFrontmatter(raw).title).toBeNull()
	})

	it("reads a bare slug value", () => {
		const raw = `---\ntitle: "Hello world"\nslug: hello-world\n---\n\nBody.`

		expect(parseFrontmatter(raw).slug).toBe("hello-world")
	})

	it("tolerates a quoted slug value from a hand-edit", () => {
		const raw = `---\ntitle: "Hello world"\nslug: "hello-world"\n---\n\nBody.`

		expect(parseFrontmatter(raw).slug).toBe("hello-world")
	})

	it("returns null slug for an empty slug value", () => {
		const raw = `---\ntitle: "Hello world"\nslug:\n---\n\nBody.`

		expect(parseFrontmatter(raw).slug).toBeNull()
	})

	it("does not read a `slug:` that appears in the body", () => {
		const raw = `---\ntitle: "Real title"\n---\n\nThe frontmatter slug: line is nice.`

		expect(parseFrontmatter(raw).slug).toBeNull()
	})
})

// #endregion

// #region setFrontmatterSlug

describe("setFrontmatterSlug", () => {
	it("inserts the slug line right after the title, preserving other keys", () => {
		const raw = `---\ntitle: "Hello world"\nsection: tech\ndate: 2026-01-01\n---\n\nBody.`

		expect(setFrontmatterSlug(raw, "hello-world")).toBe(
			`---\ntitle: "Hello world"\nslug: hello-world\nsection: tech\ndate: 2026-01-01\n---\n\nBody.`
		)
	})

	it("replaces an existing slug line in place", () => {
		const raw = `---\ntitle: "Hello world"\nslug: "Hello World"\nsection: tech\n---\n\nBody.`

		expect(setFrontmatterSlug(raw, "hello-world")).toBe(
			`---\ntitle: "Hello world"\nslug: hello-world\nsection: tech\n---\n\nBody.`
		)
	})

	it("preserves the body byte-for-byte, including a --- inside it", () => {
		const raw = buildPostFile("Title", "Body\n\n---\n\nMore body.")
		const written = setFrontmatterSlug(raw, "title")

		expect(parseFrontmatter(written).body).toBe("Body\n\n---\n\nMore body.")
	})

	it("keeps CRLF line endings", () => {
		const raw = `---\r\ntitle: "Hello world"\r\n---\r\n\r\nBody.`

		expect(setFrontmatterSlug(raw, "hello-world")).toBe(
			`---\r\ntitle: "Hello world"\r\nslug: hello-world\r\n---\r\n\r\nBody.`
		)
	})

	it("inserts at the top of the block when there is no title line", () => {
		const raw = `---\ndate: 2026-01-01\n---\n\nBody.`

		expect(setFrontmatterSlug(raw, "hello-world")).toBe(
			`---\nslug: hello-world\ndate: 2026-01-01\n---\n\nBody.`
		)
	})

	it("returns the input unchanged when there is no frontmatter block", () => {
		const raw = `Just a plain title\n\nBody.`

		expect(setFrontmatterSlug(raw, "hello-world")).toBe(raw)
	})

	it("round-trips through parseFrontmatter", () => {
		const raw = buildPostFile("Hello world", "Body text.")
		const parsed = parseFrontmatter(setFrontmatterSlug(raw, "hello-world"))

		expect(parsed).toEqual({
			title: "Hello world",
			slug: "hello-world",
			body: "Body text.",
		})
	})
})

// #endregion

// #region buildPostFile + round-trip

describe("buildPostFile", () => {
	it("wraps a simple title and body", () => {
		expect(buildPostFile("Hello world", "Body text.")).toBe(
			`---\ntitle: "Hello world"\n---\n\nBody text.`
		)
	})

	it("escapes quotes and backslashes in the title", () => {
		expect(buildPostFile('A "quoted" \\ word', "Body.")).toBe(
			`---\ntitle: "A \\"quoted\\" \\\\ word"\n---\n\nBody.`
		)
	})

	it("strips leading blank lines from the body", () => {
		expect(buildPostFile("Title", "\n\nBody.")).toBe(
			`---\ntitle: "Title"\n---\n\nBody.`
		)
	})

	it.each([
		"Hello world",
		"Improving the search: highlighted terms",
		"[NJS] Database handling #2",
		'A "quoted" word',
		"A fi programator după 40 de ani",
		"Debuggex.com",
	])("round-trips the title %j through build → parse", (title) => {
		const body = "Some body text.\n\nWith paragraphs."
		const parsed = parseFrontmatter(buildPostFile(title, body))

		expect(parsed.title).toBe(title)
		expect(parsed.body).toBe(body)
	})
})

// #endregion
