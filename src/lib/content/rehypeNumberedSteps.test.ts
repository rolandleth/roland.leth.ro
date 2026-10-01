import rehypeStringify from "rehype-stringify"
import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import remarkRehype from "remark-rehype"
import { unified } from "unified"
import { describe, expect, it } from "vitest"
import { rehypeNumberedSteps } from "./rehypeNumberedSteps"

const processor = unified()
	.use(remarkParse)
	.use(remarkGfm)
	.use(remarkRehype)
	.use(rehypeNumberedSteps)
	.use(rehypeStringify)

async function toHtml(markdown: string): Promise<string> {
	return String(await processor.process(markdown))
}

/** The rendered HTML with the newlines remark puts between blocks removed. */
async function toCompactHtml(markdown: string): Promise<string> {
	return (await toHtml(markdown)).replace(/\n/g, "")
}

describe("rehypeNumberedSteps", () => {
	it("turns a run of `### N. Title` headings into one ordered list of steps", async () => {
		const html = await toCompactHtml(
			[
				"### 1. Log a meal",
				"",
				"Type it in.",
				"",
				"### 2. Then how you feel",
				"",
				"Log the symptom.",
			].join("\n")
		)

		expect(html).toBe(
			[
				'<ol class="product-steps" role="list">',
				'<li class="product-step">',
				'<h3 class="product-step__title">',
				'<span class="product-step__num">1<span class="sr-only">. </span></span>',
				"<span>Log a meal</span>",
				"</h3>",
				'<div class="product-step__body"><p>Type it in.</p></div>',
				"</li>",
				'<li class="product-step">',
				'<h3 class="product-step__title">',
				'<span class="product-step__num">2<span class="sr-only">. </span></span>',
				"<span>Then how you feel</span>",
				"</h3>",
				'<div class="product-step__body"><p>Log the symptom.</p></div>',
				"</li>",
				"</ol>",
			].join("")
		)
	})

	it("keeps a step's body together when it has several blocks", async () => {
		const html = await toCompactHtml(
			["### 1. Log", "", "First.", "", "- a", "- b"].join("\n")
		)

		expect(html).toContain(
			'<div class="product-step__body"><p>First.</p><ul><li>a</li><li>b</li></ul></div>'
		)
	})

	it("keeps inline markup in the title", async () => {
		const html = await toCompactHtml("### 3. A *few* weeks later\n\nBody.")

		expect(html).toContain("<span>A <em>few</em> weeks later</span>")
	})

	it("leaves the content before the first step outside the list", async () => {
		const html = await toCompactHtml(
			["Intro.", "", "### 1. Log", "", "Body."].join("\n")
		)

		expect(html.startsWith('<p>Intro.</p><ol class="product-steps"')).toBe(true)
	})

	it("ends the run at a heading that isn't a step, and keeps that heading as it was", async () => {
		const html = await toCompactHtml(
			["### 1. Log", "", "Body.", "", "## Afterwards", "", "More."].join("\n")
		)

		expect(html).toContain("</ol><h2>Afterwards</h2><p>More.</p>")
	})

	it("leaves an `h3` without a number alone", async () => {
		const html = await toCompactHtml("### Log a meal\n\nBody.")

		expect(html).toBe("<h3>Log a meal</h3><p>Body.</p>")
	})

	it("needs a title after the number", async () => {
		// A bare "1." heading is not a step.
		const html = await toCompactHtml("### 2024.\n\nBody.")

		expect(html).not.toContain("product-steps")
	})

	it("leaves numbered `h2` and `h4` headings alone", async () => {
		const html = await toCompactHtml("## 1. Big\n\n#### 2. Small")

		expect(html).toBe("<h2>1. Big</h2><h4>2. Small</h4>")
	})

	it("starts a second list after a non-step heading interrupts the run", async () => {
		const html = await toCompactHtml(
			["### 1. A", "", "## Break", "", "### 2. B"].join("\n")
		)

		expect(html.match(/<ol class="product-steps"/g)).toHaveLength(2)
	})
})
