import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { markdownToReact } from "@/lib/markdown"

async function render(markdown: string): Promise<string> {
	const node = await markdownToReact(markdown)
	return renderToStaticMarkup(node as React.ReactElement)
}

describe("markdownToReact", () => {
	it("renders a heading", async () => {
		const html = await render("# Hello")
		expect(html).toContain("<h1>")
		expect(html).toContain("Hello")
	})

	it("renders plain text in a paragraph", async () => {
		const html = await render("Just some plain text.")
		expect(html).toContain("<p>")
		expect(html).toContain("Just some plain text.")
	})

	it("renders bold and italic text", async () => {
		const html = await render("**bold** and _italic_")
		expect(html).toContain("<strong>")
		expect(html).toContain("<em>")
	})

	it("renders a link with href and label", async () => {
		const html = await render("[label](https://example.com)")
		expect(html).toContain('<a href="https://example.com"')
		expect(html).toContain("label")
	})

	it("renders a blockquote", async () => {
		const html = await render("> A quoted line.")
		expect(html).toContain("<blockquote>")
		expect(html).toContain("A quoted line.")
	})

	it("renders a fenced code block with the language recorded and token spans", async () => {
		const html = await render("```ts\nconst x = 1\n```")
		// Behavior contract: a <code> element exists, the language is recorded
		// on it (how — class or data-attr — is a plugin detail), and the
		// highlighter has broken the source into <span> token nodes.
		expect(html).toMatch(
			/<code[^>]*(class="[^"]*language-ts|data-language="ts")/
		)
		expect(html).toContain("<span")
	})

	it("renders inline code", async () => {
		const html = await render("Use `const` for constants.")
		expect(html).toMatch(/<code[^>]*>const<\/code>/)
	})

	it("renders a GFM table", async () => {
		const html = await render("| A | B |\n|---|---|\n| 1 | 2 |")
		expect(html).toContain("<table>")
		expect(html).toContain("<th>")
		expect(html).toContain("<td>")
	})

	it("renders GFM strikethrough", async () => {
		const html = await render("~~gone~~")
		expect(html).toContain("<del>")
		expect(html).toContain("gone")
	})

	it("renders GFM task lists with checkbox inputs", async () => {
		const html = await render("- [x] done\n- [ ] open")
		expect(html).toContain("<ul")
		expect(html).toContain('type="checkbox"')
		expect(html).toContain("checked")
	})

	it("renders a GFM autolink for bare URLs", async () => {
		const html = await render("See https://example.com for details.")
		expect(html).toContain('<a href="https://example.com"')
	})

	it("renders an unordered list", async () => {
		const html = await render("- one\n- two\n- three")
		expect(html).toContain("<ul>")
		expect(html).toContain("<li>one</li>")
		expect(html).toContain("<li>three</li>")
	})

	it("renders an ordered list", async () => {
		const html = await render("1. first\n2. second\n3. third")
		expect(html).toContain("<ol>")
		expect(html).toContain("<li>first</li>")
		expect(html).toContain("<li>third</li>")
	})

	it("renders nested lists", async () => {
		const html = await render("- outer\n  - inner-a\n  - inner-b")
		// Outer <ul> contains a nested <ul>; assert both the parent and nested
		// list items appear.
		expect(html).toContain("<ul>")
		expect(html).toContain("inner-a")
		expect(html).toContain("inner-b")
		// The inner list lives inside the outer list item.
		expect(html).toMatch(/<li>[\s\S]*outer[\s\S]*<ul>[\s\S]*inner-a/)
	})

	it("renders nested inline elements (bold inside a link)", async () => {
		const html = await render("[**bold link**](https://example.com)")
		expect(html).toMatch(
			/<a[^>]*href="https:\/\/example\.com"[^>]*>\s*<strong>bold link<\/strong>/
		)
	})

	it("returns empty output for an empty string", async () => {
		const html = await render("")
		expect(html).toBe("")
	})

	it("renders multiple headings and paragraphs", async () => {
		const content = `# Title\n\nFirst paragraph.\n\n## Section\n\nSecond paragraph.`
		const html = await render(content)
		expect(html).toContain("<h1>")
		expect(html).toContain("<h2>")
		expect(html).toContain("First paragraph.")
		expect(html).toContain("Second paragraph.")
	})
})
