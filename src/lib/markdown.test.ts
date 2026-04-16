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

	it("renders a fenced code block with syntax highlighting", async () => {
		const html = await render("```ts\nconst x = 1\n```")
		// rehype-pretty-code tokenizes code into <span>s, so raw text won't appear;
		// assert on the structural markers it always emits instead.
		expect(html).toContain('data-language="ts"')
		expect(html).toContain("data-rehype-pretty-code-figure")
	})

	it("renders a GFM table", async () => {
		const html = await render("| A | B |\n|---|---|\n| 1 | 2 |")
		expect(html).toContain("<table>")
		expect(html).toContain("<th>")
		expect(html).toContain("<td>")
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
