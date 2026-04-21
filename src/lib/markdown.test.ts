import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { markdownToHtml, markdownToReact, stripMarkdown } from "@/lib/markdown"

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

describe("markdownToHtml", () => {
	it("renders plain text in a paragraph", async () => {
		const html = await markdownToHtml("Just some plain text.")
		expect(html).toContain("<p>Just some plain text.</p>")
	})

	it("renders headings", async () => {
		expect(await markdownToHtml("# H1")).toContain("<h1>H1</h1>")
		expect(await markdownToHtml("## H2")).toContain("<h2>H2</h2>")
	})

	it("renders bold and italic", async () => {
		const html = await markdownToHtml("**bold** and _italic_")
		expect(html).toContain("<strong>bold</strong>")
		expect(html).toContain("<em>italic</em>")
	})

	it("renders links with href", async () => {
		const html = await markdownToHtml("[label](https://example.com)")
		expect(html).toContain('href="https://example.com"')
		expect(html).toContain("label")
	})

	it("renders fenced code blocks as plain <pre><code> without Shiki spans", async () => {
		const html = await markdownToHtml("```ts\nconst x = 1\n```")
		expect(html).toContain("<pre>")
		expect(html).toContain("<code")
		// Contract: markdownToHtml must never emit Shiki-generated <span> tokens.
		// Feed readers have no access to the site's stylesheet, so highlighted spans
		// render as unstyled noise. If this assertion fails, rehype-pretty-code was
		// added to htmlProcessor in markdown.ts — remove it.
		expect(html).not.toContain("<span")
	})

	it("renders inline code", async () => {
		const html = await markdownToHtml("Use `const` here.")
		expect(html).toContain("<code>const</code>")
	})

	it("renders a GFM table", async () => {
		const html = await markdownToHtml("| A | B |\n|---|---|\n| 1 | 2 |")
		expect(html).toContain("<table>")
		expect(html).toContain("<th>")
		expect(html).toContain("<td>")
	})

	it("renders GFM strikethrough", async () => {
		const html = await markdownToHtml("~~gone~~")
		expect(html).toContain("<del>gone</del>")
	})

	it("returns empty output for an empty string", async () => {
		expect(await markdownToHtml("")).toBe("")
	})

	// `remark-rehype` defaults to dropping raw HTML (no `allowDangerousHtml`).
	// Any `<script>`, `<iframe>`, etc. authored inside a post body is discarded
	// before reaching the feed. This test locks that contract in: if a future
	// change passes `allowDangerousHtml: true`, it will break here, prompting a
	// conscious decision about sanitization.
	it("drops raw HTML embedded in markdown", async () => {
		const html = await markdownToHtml(
			"Before\n\n<script>alert(1)</script>\n\nAfter"
		)
		expect(html).not.toContain("<script>")
		expect(html).toContain("<p>Before</p>")
		expect(html).toContain("<p>After</p>")
	})
})

describe("stripMarkdown", () => {
	it("passes plain text through unchanged", () => {
		expect(stripMarkdown("Just some plain text.")).toBe("Just some plain text.")
	})

	it("strips heading markers", () => {
		expect(stripMarkdown("# Title")).toBe("Title")
		expect(stripMarkdown("## Section")).toBe("Section")
	})

	it("strips bold and italic syntax", () => {
		expect(stripMarkdown("**bold** and _italic_")).toBe("bold and italic")
	})

	it("extracts link text, drops the URL", () => {
		expect(stripMarkdown("[label](https://example.com)")).toBe("label")
	})

	it("keeps inline code value", () => {
		expect(stripMarkdown("Use `const` here.")).toBe("Use const here.")
	})

	it("strips fenced code blocks entirely", () => {
		expect(stripMarkdown("Before.\n\n```ts\nconst x = 1\n```\n\nAfter.")).toBe(
			"Before. After."
		)
	})

	it("strips blockquote markers", () => {
		expect(stripMarkdown("> A quoted line.")).toBe("A quoted line.")
	})

	it("collapses multiple paragraphs into a single space-separated string", () => {
		expect(stripMarkdown("First.\n\nSecond.")).toBe("First. Second.")
	})

	it("returns an empty string for empty input", () => {
		expect(stripMarkdown("")).toBe("")
	})

	it("strips GFM strikethrough syntax", () => {
		expect(stripMarkdown("~~gone~~ remains")).toBe("gone remains")
	})

	it("extracts image alt text (inline image)", () => {
		expect(
			stripMarkdown("Before ![Screenshot of the dashboard](/img.png) after.")
		).toBe("Before Screenshot of the dashboard after.")
	})

	it("extracts image alt text (image reference)", () => {
		const md = "Before ![Diagram of the flow][ref] after.\n\n[ref]: /img.png"
		expect(stripMarkdown(md)).toBe("Before Diagram of the flow after.")
	})

	it("returns empty string for an image with no alt text", () => {
		expect(stripMarkdown("![](/img.png)")).toBe("")
	})
})
