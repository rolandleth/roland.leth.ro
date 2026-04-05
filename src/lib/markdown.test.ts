import { describe, expect, it } from "vitest"
import { markdownToReact } from "@/lib/markdown"

describe("markdownToReact", () => {
	it("returns a non-null value for a heading", async () => {
		const result = await markdownToReact("# Hello")
		expect(result).not.toBeNull()
	})

	it("returns a non-null value for plain text", async () => {
		const result = await markdownToReact("Just some plain text.")
		expect(result).not.toBeNull()
	})

	it("returns a non-null value for bold and italic text", async () => {
		const result = await markdownToReact("**bold** and _italic_")
		expect(result).not.toBeNull()
	})

	it("returns a non-null value for a link", async () => {
		const result = await markdownToReact("[label](https://example.com)")
		expect(result).not.toBeNull()
	})

	it("returns a non-null value for a blockquote", async () => {
		const result = await markdownToReact("> A quoted line.")
		expect(result).not.toBeNull()
	})

	it("returns a non-null value for a fenced code block", async () => {
		const result = await markdownToReact("```ts\nconst x = 1\n```")
		expect(result).not.toBeNull()
	})

	it("returns a non-null value for a GFM table", async () => {
		const result = await markdownToReact("| A | B |\n|---|---|\n| 1 | 2 |")
		expect(result).not.toBeNull()
	})

	it("does not throw for an empty string", async () => {
		await expect(markdownToReact("")).resolves.not.toThrow()
	})

	it("handles multiple headings and paragraphs", async () => {
		const content = `# Title\n\nFirst paragraph.\n\n## Section\n\nSecond paragraph.`
		const result = await markdownToReact(content)
		expect(result).not.toBeNull()
	})
})
