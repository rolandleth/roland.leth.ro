import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
	deriveSummary,
	extractDefinitions,
	markdownToHtml,
	markdownToReact,
	stripMarkdown,
	SUMMARY_MAX_CHARS,
	truncateBody,
} from "@/lib/content/markdown"

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

describe("deriveSummary", () => {
	it("returns the stripped body verbatim when it fits the cap", () => {
		expect(deriveSummary("A short body.")).toBe("A short body.")
	})

	it("strips markdown before measuring length", () => {
		expect(deriveSummary("# Heading\n\n**Bold body** here.")).toBe(
			"Heading Bold body here."
		)
	})

	it("truncates at the last word boundary and appends an ellipsis", () => {
		// Build a body whose stripped form is well over the cap and where the
		// 160th char lands mid-word — verify we walk back to the previous
		// space rather than cutting the word in half.
		const body = "alpha bravo charlie ".repeat(20).trim()
		const result = deriveSummary(body)

		expect(result.endsWith("…")).toBe(true)
		// Length excluding the ellipsis must fit inside the cap.
		expect(result.length - 1).toBeLessThanOrEqual(SUMMARY_MAX_CHARS)
		// No partial word at the tail — the char before "…" is a full token.
		const beforeEllipsis = result.slice(0, -1)
		expect(beforeEllipsis.endsWith(" ")).toBe(false)
		expect(/\s\S+$/.test(beforeEllipsis)).toBe(true)
	})

	it("falls back to a hard slice when the source has no whitespace within the cap", () => {
		// Pathological body (URL-like blob, no spaces). Hard-slicing is the
		// only sensible fallback — the alternative is returning an empty
		// string, which violates the "never empty" invariant.
		const body = "a".repeat(200)
		const result = deriveSummary(body)
		expect(result).toBe(`${"a".repeat(SUMMARY_MAX_CHARS)}…`)
	})

	it("strips fenced code blocks before deriving", () => {
		// Mirrors stripMarkdown's behavior — code fences contribute no
		// narrative content and would otherwise pad the summary with syntax.
		const body = "Intro line.\n\n```ts\nconst noise = 1\n```\n\nOutro."
		expect(deriveSummary(body)).toBe("Intro line. Outro.")
	})
})

describe("truncateBody", () => {
	it("returns body unchanged when under 900 chars", () => {
		const body = "Short body content."
		expect(truncateBody(body)).toEqual({ text: body, isTruncated: false })
	})

	it("returns body unchanged at exactly 899 chars", () => {
		const body = "a".repeat(899)
		expect(truncateBody(body)).toEqual({ text: body, isTruncated: false })
	})

	it("truncates at a paragraph break near 700 chars", () => {
		// first paragraph ends before 700, second paragraph pushes total > 900
		const firstPara = "a".repeat(500)
		const secondPara = "b".repeat(600)
		const body = `${firstPara}\n\n${secondPara}`
		const { text, isTruncated } = truncateBody(body)
		expect(isTruncated).toBe(true)
		expect(text).toBe(firstPara)
	})

	it("truncates at 700 chars when no paragraph break exists before 700", () => {
		const body = "a".repeat(1000)
		const { text, isTruncated } = truncateBody(body)
		expect(isTruncated).toBe(true)
		expect(text).toBe("a".repeat(700))
	})

	it("trims before a heading that appears before the cut point", () => {
		// intro → heading → content; total > 900; heading falls within first 700
		const intro = "a".repeat(400)
		const heading = "\n\n## Section Heading\n\n"
		const content = "b".repeat(700)
		const body = intro + heading + content
		const { text, isTruncated } = truncateBody(body)
		expect(isTruncated).toBe(true)
		// excerpt should stop before the heading
		expect(text).toBe(intro)
	})

	// A code block whose blank line falls before 700 and whose closing delimiter
	// falls after it. That makes the blank line the last paragraph break in range,
	// so the naive cut lands inside the block.
	function straddlingBlock(delimiter: string) {
		return `${delimiter}ts\nconst x = 1\n\n${"const y = 2\n".repeat(40)}${delimiter}`
	}

	it("pulls back to the start of a fenced block the cut lands inside", () => {
		const intro = "a".repeat(400)
		const body = `${intro}\n\n${straddlingBlock("```")}\n\n${"b".repeat(600)}`
		const { text } = truncateBody(body)

		expect(text).toBe(intro)
		expect(text).not.toContain("```")
	})

	it("pulls back past a heading that introduced the fenced block", () => {
		// Pulling out of the block would otherwise strand the heading above it.
		const intro = "a".repeat(400)
		const body = `${intro}\n\n## Setup\n\n${straddlingBlock("```")}\n\n${"b".repeat(600)}`

		expect(truncateBody(body).text).toBe(intro)
	})

	it("recognises a tilde fence, not just backticks", () => {
		const intro = "a".repeat(400)
		const body = `${intro}\n\n${straddlingBlock("~~~")}\n\n${"b".repeat(600)}`

		expect(truncateBody(body).text).toBe(intro)
	})

	it("keeps a partial block when it starts at the very beginning", () => {
		// Nothing to pull back to, so the block stands as-is. An unclosed fence
		// runs to the end of input, so it still renders as code.
		const body = `\`\`\`ts\n${"const x = 1\n\n".repeat(80)}\`\`\``
		const { text, isTruncated } = truncateBody(body)

		expect(isTruncated).toBe(true)
		expect(text.startsWith("```ts")).toBe(true)
		expect(text).toContain("const x = 1")
	})

	it("leaves a cut that lands cleanly between blocks alone", () => {
		const intro = "a".repeat(400)
		const fence = "```ts\nconst x = 1\n```"
		const body = `${intro}\n\n${fence}\n\n${"b".repeat(600)}`

		// No blank line inside this fence, so the last break before 700 is the one
		// after the closing fence — the whole block belongs in the excerpt.
		expect(truncateBody(body).text).toBe(`${intro}\n\n${fence}`)
	})
})

describe("extractDefinitions", () => {
	it("returns an empty string for a body with no definitions", () => {
		expect(extractDefinitions("Just a [normal](/link) here.")).toBe("")
	})

	it("returns every definition in source order", () => {
		const body =
			"See [one][a] and [two][b].\n\n[a]: /first\n[b]: /second 'Second'"

		expect(extractDefinitions(body)).toBe(
			"[a]: /first\n\n[b]: /second 'Second'"
		)
	})

	it("keeps a title containing double quotes verbatim", () => {
		// Valid only because the title is single-quoted. Rebuilding the line from
		// the parsed `title` with `"` delimiters would truncate it mid-title;
		// slicing the source sidesteps the escaping question entirely.
		const body = `Text [x][a].\n\n[a]: /url 'He said "hi" once'`

		expect(extractDefinitions(body)).toBe(`[a]: /url 'He said "hi" once'`)
	})

	it("keeps an angle-bracketed URL containing a space", () => {
		const body = 'Text [x][a].\n\n[a]: </some path> "Title"'

		expect(extractDefinitions(body)).toBe('[a]: </some path> "Title"')
	})

	it("finds a definition nested inside a blockquote", () => {
		// A definition resolves document-wide regardless of the block it sits in,
		// so the walk can't stop at the top level.
		const body = "Text [x][a].\n\n> Quoted.\n>\n> [a]: /nested"

		expect(extractDefinitions(body)).toBe("[a]: /nested")
	})

	it("ignores a definition-shaped line inside a fenced code block", () => {
		const body = "Text.\n\n```md\n[a]: /not-a-definition\n```"

		expect(extractDefinitions(body)).toBe("")
	})

	it("restores reference links when appended to a truncated excerpt", async () => {
		// The regression this exists for: a post's definitions sit below the
		// excerpt cut, so the preview rendered `[label][ref]` as literal brackets.
		const excerpt = "Back in [the opener][series] I wrote something."
		const definitions = extractDefinitions(
			`${excerpt}\n\nMore body.\n\n[series]: /blog/tech/the-opener "The opener"`
		)

		expect(await render(excerpt)).not.toContain("<a")

		const html = await render(`${excerpt}\n\n${definitions}`)
		expect(html).toContain('href="/blog/tech/the-opener"')
		expect(html).toContain("the opener")
		expect(html).not.toContain("[series]")
	})

	it("resolves an image reference the same way", async () => {
		const excerpt = "![A diagram][fig]"
		const definitions = extractDefinitions(
			`${excerpt}\n\nBody.\n\n[fig]: /images/fig.png`
		)

		const html = await render(`${excerpt}\n\n${definitions}`)
		expect(html).toContain('src="/images/fig.png"')
		expect(html).toContain('alt="A diagram"')
	})
})
