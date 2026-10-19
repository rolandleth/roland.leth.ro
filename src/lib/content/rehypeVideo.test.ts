import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import {
	deriveDescription,
	markdownToHtml,
	markdownToReact,
	stripMarkdown,
} from "@/lib/content/markdown"

// The plugin is tested through the two pipelines that use it rather than on a
// hand-built tree: what matters is the markup a markdown body ends up as.

async function renderPage(markdown: string): Promise<string> {
	const node = await markdownToReact(markdown)

	return renderToStaticMarkup(node as React.ReactElement)
}

// #region Feed HTML

describe("a video in the feed HTML", () => {
	it("renders image syntax with a video URL as a <video>", async () => {
		const html = await markdownToHtml("![A demo](/videos/demo.mp4)")

		expect(html).toBe(
			'<p><video src="/videos/demo.mp4" controls preload="metadata" playsinline aria-label="A demo"><a href="/videos/demo.mp4">A demo</a></video></p>'
		)
	})

	it("renders a WebM the same way", async () => {
		const html = await markdownToHtml("![A demo](/videos/demo.webm)")

		expect(html).toContain('<video src="/videos/demo.webm"')
		expect(html).not.toContain("<img")
	})

	it("keeps an absolute URL as written", async () => {
		const url =
			"https://store.public.blob.vercel-storage.com/1b4e28ba-2fa1-41d2-883f-0016d3cca427-demo.mp4"
		const html = await markdownToHtml(`![A demo](${url})`)

		expect(html).toContain(`<video src="${url}"`)
		expect(html).toContain(`<a href="${url}">`)
	})

	it("keeps a query string and a fragment on the URL", async () => {
		const html = await markdownToHtml("![A demo](/videos/demo.mp4?v=2#t=5)")

		expect(html).toContain('<video src="/videos/demo.mp4?v=2#t=5"')
	})

	it("leaves an ordinary image as an <img>", async () => {
		const html = await markdownToHtml("![A cover](/images/cover.png)")

		expect(html).toBe('<p><img src="/images/cover.png" alt="A cover"></p>')
	})

	it("leaves an image alone when a video extension is not the end of its path", async () => {
		const html = await markdownToHtml(
			"![A poster](/videos/demo.mp4.png) ![A cover](/images/cover.png?source=demo.mp4)"
		)

		expect(html).not.toContain("<video")
		expect(html.match(/<img/g)).toHaveLength(2)
	})

	it("omits the label and falls back to a generic link text when there is no alt", async () => {
		const html = await markdownToHtml("![](/videos/demo.mp4)")

		expect(html).not.toContain("aria-label")
		expect(html).toContain('<a href="/videos/demo.mp4">Video</a>')
	})

	it("treats a whitespace-only alt as no alt", async () => {
		const html = await markdownToHtml("![ ](/videos/demo.mp4)")

		expect(html).not.toContain("aria-label")
		expect(html).toContain(">Video</a>")
	})

	it("never carries the alt attribute onto the video", async () => {
		const html = await markdownToHtml("![A demo](/videos/demo.mp4)")

		expect(html).not.toContain("alt=")
	})

	it("carries the title", async () => {
		const html = await markdownToHtml(
			'![A demo](/videos/demo.mp4 "The picker, start to finish")'
		)

		expect(html).toContain('title="The picker, start to finish"')
	})

	it("escapes markup characters in the alt text", async () => {
		const html = await markdownToHtml(
			'![A "quoted" <b>demo</b> & more](/videos/demo.mp4)'
		)

		// In the attribute, the quotes are what could end the value early; a `<`
		// between quotes is inert. In the link text, the `<` is what could open
		// an element.
		expect(html).toContain(
			'aria-label="A &#x22;quoted&#x22; <b>demo</b> &#x26; more"'
		)
		expect(html).toContain(
			'<a href="/videos/demo.mp4">A "quoted" &#x3C;b>demo&#x3C;/b> &#x26; more</a>'
		)
	})

	it("converts a reference-style image", async () => {
		const html = await markdownToHtml(
			"![A demo][clip]\n\n[clip]: /videos/demo.mp4"
		)

		expect(html).toContain('<video src="/videos/demo.mp4"')
	})

	it("converts a video nested in a list and in a blockquote", async () => {
		const html = await markdownToHtml(
			"- ![In a list](/videos/list.mp4)\n\n> ![In a quote](/videos/quote.webm)"
		)

		expect(html).toContain('<video src="/videos/list.mp4"')
		expect(html).toContain('<video src="/videos/quote.webm"')
	})

	it("converts each video and leaves the image between them", async () => {
		const html = await markdownToHtml(
			"![One](/videos/one.mp4)\n\n![A cover](/images/cover.png)\n\n![Two](/videos/two.webm)"
		)

		expect(html.match(/<video/g)).toHaveLength(2)
		expect(html.match(/<img/g)).toHaveLength(1)
	})

	it("lifts a video out of a link and puts the link after it, named by its URL", async () => {
		// A <video> inside an <a> is invalid, and its fallback <a> would nest in
		// the outer one.
		const html = await markdownToHtml(
			"[![A demo](/videos/demo.mp4)](https://example.com)"
		)

		expect(html).toBe(
			'<p><span><video src="/videos/demo.mp4" controls preload="metadata" playsinline aria-label="A demo"><a href="/videos/demo.mp4">A demo</a></video><a href="https://example.com">https://example.com</a></span></p>'
		)
		expect(html).not.toMatch(/<a [^>]*>(?:(?!<\/a>).)*<video/)
	})

	it("keeps a lifted link's own text and title", async () => {
		const html = await markdownToHtml(
			'[![A demo](/videos/demo.mp4) Watch the tour](https://example.com "Tour")'
		)

		expect(html).toContain(
			'</video><a href="https://example.com" title="Tour"> Watch the tour</a></span>'
		)
	})

	it("lifts a video nested deeper inside a link", async () => {
		const html = await markdownToHtml(
			"[**![A demo](/videos/demo.mp4)**](https://example.com)"
		)

		// The emptied `<strong>` goes with the rest of the link's empty content.
		expect(html).toMatch(/^<p><span><video /)
		expect(html).toContain(
			'</video><a href="https://example.com">https://example.com</a></span>'
		)
	})

	it("lifts every video out of one link, in order", async () => {
		const html = await markdownToHtml(
			"[![One](/videos/one.mp4)![Two](/videos/two.webm)](https://example.com)"
		)

		expect(html.indexOf("one.mp4")).toBeLessThan(html.indexOf("two.webm"))
		expect(html.indexOf("two.webm")).toBeLessThan(
			html.indexOf('href="https://example.com"')
		)
	})

	it("leaves a link around an ordinary image alone", async () => {
		const html = await markdownToHtml(
			"[![A cover](/images/cover.png)](https://example.com)"
		)

		expect(html).toBe(
			'<p><a href="https://example.com"><img src="/images/cover.png" alt="A cover"></a></p>'
		)
	})

	it("carries a title with no alt, and falls back to the generic link text", async () => {
		const html = await markdownToHtml('![](/videos/demo.mp4 "The tour")')

		expect(html).toContain('title="The tour"')
		expect(html).not.toContain("aria-label")
		expect(html).toContain(">Video</a>")
	})

	it.each([
		"javascript:alert(1)//.mp4",
		"data:video/mp4;base64,AAAA.mp4",
		"vbscript:x.mp4",
	])("leaves %j an image, so no link carries its scheme", async (url) => {
		const html = await markdownToHtml(`![A demo](${url})`)

		expect(html).not.toContain("<video")
		expect(html).not.toContain("<a ")
	})

	it.each([
		"https://example.com/demo.mp4",
		"HTTP://example.com/demo.mp4",
		"/videos/demo.mp4",
		"media/demo.mp4",
		"./demo.mp4",
	])("converts the http(s) or scheme-less URL %j", async (url) => {
		expect(await markdownToHtml(`![A demo](${url})`)).toContain("<video")
	})

	it("leaves a plain link to a video file as a link", async () => {
		const html = await markdownToHtml("[Download](/videos/demo.mp4)")

		expect(html).toBe('<p><a href="/videos/demo.mp4">Download</a></p>')
	})

	it("does not convert image syntax inside a code block", async () => {
		const html = await markdownToHtml("```md\n![A demo](/videos/demo.mp4)\n```")

		expect(html).not.toContain("<video")
		expect(html).toContain("![A demo](/videos/demo.mp4)")
	})

	// The reason videos use image syntax at all: raw HTML stays dropped, so an
	// authored `<video>` tag must still not reach the output.
	it("still drops a raw <video> tag", async () => {
		const html = await markdownToHtml(
			'Before\n\n<video src="/videos/demo.mp4" autoplay></video>\n\nAfter'
		)

		expect(html).not.toContain("<video")
		expect(html).toContain("<p>Before</p>")
		expect(html).toContain("<p>After</p>")
	})
})

// #endregion

// #region Feed URLs

describe("a video in the feed HTML, with the site's origin", () => {
	const baseUrl = "https://roland.leth.ro"

	it("makes a root-relative video and its fallback link absolute", async () => {
		const html = await markdownToHtml("![A demo](/videos/demo.mp4)", {
			baseUrl,
		})

		expect(html).toContain(
			'<video src="https://roland.leth.ro/videos/demo.mp4"'
		)
		expect(html).toContain(
			'<a href="https://roland.leth.ro/videos/demo.mp4">A demo</a>'
		)
	})

	it("makes root-relative images and links absolute too", async () => {
		const html = await markdownToHtml(
			"![A cover](/images/cover.png) [Older post](/blog/tech/older)",
			{ baseUrl }
		)

		expect(html).toContain('src="https://roland.leth.ro/images/cover.png"')
		expect(html).toContain('href="https://roland.leth.ro/blog/tech/older"')
	})

	it.each([
		["an absolute URL", "https://example.com/demo.mp4"],
		["a protocol-relative URL", "//cdn.example.com/demo.mp4"],
		["a path relative to the post", "media/demo.mp4"],
	])("leaves %s as written", async (_case, url) => {
		const html = await markdownToHtml(`![A demo](${url})`, { baseUrl })

		expect(html).toContain(`<video src="${url}"`)
	})

	it("leaves a fragment link as written", async () => {
		const html = await markdownToHtml("[Notes](#notes)", { baseUrl })

		expect(html).toContain('href="#notes"')
	})

	it("leaves every URL as written without an origin", async () => {
		const html = await markdownToHtml("![A demo](/videos/demo.mp4)")

		expect(html).toContain('<video src="/videos/demo.mp4"')
	})
})

// #endregion

// #region Page render

describe("a video on the page", () => {
	it("renders a <video> with controls, metadata preload and inline playback", async () => {
		const html = await renderPage("![A demo](/videos/demo.mp4)")

		expect(html).toContain('<video src="/videos/demo.mp4"')
		expect(html).toMatch(/<video[^>]* controls=""/)
		expect(html).toMatch(/<video[^>]* preload="metadata"/)
		expect(html).toMatch(/<video[^>]* playsinline=""/i)
		expect(html).toMatch(/<video[^>]* aria-label="A demo"/)
		expect(html).not.toContain("<img")
	})

	it("fetches nothing before play in a blog list card", async () => {
		// A list page shows many cards; a video near the top of each post would
		// otherwise fetch its metadata on every view of the list.
		const node = await markdownToReact("![A demo](/videos/demo.mp4)", {
			isListCard: true,
		})
		const html = renderToStaticMarkup(node as React.ReactElement)

		expect(html).toMatch(/<video[^>]* preload="none"/)
		expect(html).not.toContain('preload="metadata"')
	})

	it("never autoplays, loops or mutes", async () => {
		const html = await renderPage("![A demo](/videos/demo.mp4)")

		expect(html).not.toMatch(/autoplay|loop|muted/i)
	})

	it("renders the fallback link inside the video", async () => {
		const html = await renderPage("![A demo](/videos/demo.mp4)")

		expect(html).toContain('<a href="/videos/demo.mp4">A demo</a></video>')
	})

	it("leaves an ordinary image as an <img>", async () => {
		const html = await renderPage("![A cover](/images/cover.png)")

		expect(html).toContain('<img src="/images/cover.png" alt="A cover"/>')
	})

	it("renders a video next to a highlighted code block", async () => {
		const html = await renderPage(
			"![A demo](/videos/demo.mp4)\n\n```ts\nconst x = 1\n```"
		)

		expect(html).toContain("<video")
		expect(html).toContain("data-rehype-pretty-code-figure")
	})
})

// #endregion

// #region Text extraction

describe("a video in extracted text", () => {
	it("contributes its alt text, as an image does", () => {
		expect(
			stripMarkdown("Intro.\n\n![A demo of the picker](/videos/demo.mp4)")
		).toBe("Intro. A demo of the picker")
	})

	it("contributes nothing without alt text", () => {
		expect(stripMarkdown("Intro.\n\n![](/videos/demo.mp4)")).toBe("Intro.")
	})

	it("never leaks the URL into a derived description", () => {
		expect(deriveDescription("![A demo of the picker](/videos/demo.mp4)")).toBe(
			"A demo of the picker"
		)
	})
})

// #endregion
