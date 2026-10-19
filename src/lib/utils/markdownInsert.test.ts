import { describe, expect, it } from "vitest"
import { insertMarkdownBlock } from "./markdownInsert"

const BLOCK = "![](https://example.com/clip.mp4)"

describe("insertMarkdownBlock", () => {
	it("returns just the block for an empty text", () => {
		expect(insertMarkdownBlock("", BLOCK, 0)).toEqual({
			text: BLOCK,
			blockStart: 0,
		})
	})

	it("puts the block after the text when the cursor is at its end", () => {
		const text = "First paragraph."

		expect(insertMarkdownBlock(text, BLOCK, text.length)).toEqual({
			text: `First paragraph.\n\n${BLOCK}`,
			blockStart: text.length + 2,
		})
	})

	it("puts the block before the text when the cursor is at its start", () => {
		expect(insertMarkdownBlock("First paragraph.", BLOCK, 0)).toEqual({
			text: `${BLOCK}\n\nFirst paragraph.`,
			blockStart: 0,
		})
	})

	it("puts the block after the line when the cursor is inside it, never inside the sentence", () => {
		const text = "One two.\n\nThree."

		expect(insertMarkdownBlock(text, BLOCK, 4).text).toBe(
			`One two.\n\n${BLOCK}\n\nThree.`
		)
	})

	it("puts the block before a paragraph when the cursor is at its first character", () => {
		const text = "One.\n\nTwo."
		const cursor = text.indexOf("Two")

		expect(insertMarkdownBlock(text, BLOCK, cursor).text).toBe(
			`One.\n\n${BLOCK}\n\nTwo.`
		)
	})

	it("puts the block after a hard-wrapped paragraph, never between its lines", () => {
		const text = "Line one\nline two\nline three\n\nNext."

		expect(insertMarkdownBlock(text, BLOCK, 11).text).toBe(
			`Line one\nline two\nline three\n\n${BLOCK}\n\nNext.`
		)
	})

	it("puts the block after a fenced code block, never inside it", () => {
		const text = "```ts\nconst a = 1\nconst b = 2\n```\n\nAfter."
		const cursor = text.indexOf("const b")

		expect(insertMarkdownBlock(text, BLOCK, cursor).text).toBe(
			`\`\`\`ts\nconst a = 1\nconst b = 2\n\`\`\`\n\n${BLOCK}\n\nAfter.`
		)
	})

	it("puts the block after a whole list, so its numbering carries on", () => {
		const text = "1. One\n2. Two\n3. Three\n\nAfter."
		const cursor = text.indexOf("Two")

		expect(insertMarkdownBlock(text, BLOCK, cursor).text).toBe(
			`1. One\n2. Two\n3. Three\n\n${BLOCK}\n\nAfter.`
		)
	})

	it("puts the block after a quote of several lines", () => {
		const text = "> One\n> two\n\nAfter."

		expect(insertMarkdownBlock(text, BLOCK, 3).text).toBe(
			`> One\n> two\n\n${BLOCK}\n\nAfter.`
		)
	})

	it("puts the block after a table, never between its rows", () => {
		const text = "| A |\n|---|\n| 1 |\n| 2 |\n\nAfter."
		const cursor = text.indexOf("1")

		expect(insertMarkdownBlock(text, BLOCK, cursor).text).toBe(
			`| A |\n|---|\n| 1 |\n| 2 |\n\n${BLOCK}\n\nAfter.`
		)
	})

	it("puts the block before a list when the cursor is at its start", () => {
		const text = "Intro.\n\n- One\n- Two"
		const cursor = text.indexOf("- One")

		expect(insertMarkdownBlock(text, BLOCK, cursor).text).toBe(
			`Intro.\n\n${BLOCK}\n\n- One\n- Two`
		)
	})

	it("adds one newline where the cursor already sits on a fresh line", () => {
		const text = "First.\n"

		expect(insertMarkdownBlock(text, BLOCK, text.length).text).toBe(
			`First.\n\n${BLOCK}`
		)
	})

	it("adds nothing on an empty line between two paragraphs", () => {
		const text = "First.\n\n\n\nSecond."
		const cursor = "First.\n\n".length

		expect(insertMarkdownBlock(text, BLOCK, cursor).text).toBe(
			`First.\n\n${BLOCK}\n\nSecond.`
		)
	})

	it("does not stack blank lines when more than one already follows", () => {
		const text = "First.\n\n\n\nSecond."

		expect(insertMarkdownBlock(text, BLOCK, "First.".length).text).toBe(
			`First.\n\n${BLOCK}\n\n\n\nSecond.`
		)
	})

	it("never removes a character of the text", () => {
		const text = "Keep this. And this.\n\nAnd that."

		for (let cursor = 0; cursor <= text.length; cursor++) {
			const result = insertMarkdownBlock(text, BLOCK, cursor)
			const withoutBlock =
				result.text.slice(0, result.blockStart) +
				result.text.slice(result.blockStart + BLOCK.length)

			expect(withoutBlock.replace(/\n/g, "")).toBe(text.replace(/\n/g, ""))
		}
	})

	it("stacks a second block after the first when the cursor was left inside it", () => {
		// The upload leaves the cursor in the first video's alt text. A second
		// upload before the author moves it must not split that markdown.
		const first = insertMarkdownBlock("Intro.", BLOCK, 6)
		const cursorInAlt = first.blockStart + 2
		const second = insertMarkdownBlock(
			first.text,
			"![](second.mp4)",
			cursorInAlt
		)

		expect(second.text).toBe(`Intro.\n\n${BLOCK}\n\n![](second.mp4)`)
	})

	it("appends when the remembered cursor is past the end of the text", () => {
		// The body was cut after the cursor was read.
		expect(insertMarkdownBlock("Short.", BLOCK, 500)).toEqual({
			text: `Short.\n\n${BLOCK}`,
			blockStart: 8,
		})
	})

	it("treats a negative cursor as the start", () => {
		expect(insertMarkdownBlock("Text.", BLOCK, -5).text).toBe(
			`${BLOCK}\n\nText.`
		)
	})

	it("always reports where the block landed", () => {
		const text = "One.\n\nTwo three.\nFour.\n"

		for (let cursor = 0; cursor <= text.length; cursor++) {
			const result = insertMarkdownBlock(text, BLOCK, cursor)

			expect(
				result.text.slice(result.blockStart, result.blockStart + BLOCK.length)
			).toBe(BLOCK)
		}
	})

	it("always leaves the block as a paragraph of its own", () => {
		const text = "One.\n\nTwo three.\nFour.\n"

		for (let cursor = 0; cursor <= text.length; cursor++) {
			const result = insertMarkdownBlock(text, BLOCK, cursor)

			expect(result.text.split(/\n{2,}/)).toContain(BLOCK)
		}
	})
})
