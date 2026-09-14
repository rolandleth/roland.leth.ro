import { describe, expect, it } from "vitest"
import { parseFrontmatter } from "@/lib/import/frontmatter"
import { postDatetimeToISO } from "@/lib/utils/format"
import { buildPostMarkdownFile } from "./postMarkdown"
import type { PostDetail } from "@/lib/db/posts"

const basePost: PostDetail = {
	id: 1,
	title: "Hello World",
	slug: "hello-world",
	section: "tech",
	datetime: "2024-01-15-0930",
	body: "First paragraph.\n\nSecond paragraph.",
	description: "A short summary.",
	imageUrl: null,
	readingTime: null,
	updatedAt: new Date("2024-01-15T09:30:00.000Z"),
}

describe("buildPostMarkdownFile", () => {
	it("emits a frontmatter block with title, slug, section, date, and canonical URL", () => {
		const file = buildPostMarkdownFile(basePost, "https://roland.leth.ro")

		expect(file).toContain('title: "Hello World"')
		expect(file).toContain("slug: hello-world")
		expect(file).toContain("section: tech")
		// Date is timezone-normalized by the same formatter the JSON-LD / OG tags
		// use; derive the expectation from it rather than hardcoding a TZ offset.
		expect(file).toContain(`date: ${postDatetimeToISO(basePost.datetime)}`)
		expect(file).toContain(
			"canonical: https://roland.leth.ro/blog/tech/hello-world"
		)
		expect(file).toContain('description: "A short summary."')
	})

	it("appends the raw body verbatim after the frontmatter block", () => {
		const file = buildPostMarkdownFile(basePost, "https://roland.leth.ro")
		expect(file.endsWith("\n\nFirst paragraph.\n\nSecond paragraph.")).toBe(
			true
		)
	})

	it("round-trips through the importer's parseFrontmatter (title + slug + description + body preserved)", () => {
		const file = buildPostMarkdownFile(basePost, "https://roland.leth.ro")
		const parsed = parseFrontmatter(file)

		expect(parsed.title).toBe(basePost.title)
		// The stored slug survives even when it no longer matches what the title
		// derives — the whole reason the export carries an explicit `slug:`.
		expect(parsed.slug).toBe(basePost.slug)
		// And the description lands on the value it left with, so a re-import of
		// an export plans no description write.
		expect(parsed.description).toBe(basePost.description)
		expect(parsed.body).toBe(basePost.body)
	})

	it("escapes a description containing quotes so it round-trips", () => {
		const post = { ...basePost, description: 'Say "no" more.' }
		const parsed = parseFrontmatter(
			buildPostMarkdownFile(post, "https://roland.leth.ro")
		)
		expect(parsed.description).toBe('Say "no" more.')
	})

	it("escapes a title containing quotes and backslashes so it round-trips", () => {
		const post = { ...basePost, title: 'A "quoted" \\ path' }
		const parsed = parseFrontmatter(
			buildPostMarkdownFile(post, "https://roland.leth.ro")
		)
		expect(parsed.title).toBe('A "quoted" \\ path')
	})

	it("omits the date line when the stored datetime is malformed", () => {
		const post = { ...basePost, datetime: "not-a-date" }
		const file = buildPostMarkdownFile(post, "https://roland.leth.ro")

		expect(file).not.toContain("date:")
		expect(file).not.toContain("undefined")
		// The rest of the frontmatter still renders and the body still round-trips.
		expect(parseFrontmatter(file).body).toBe(post.body)
	})
})
