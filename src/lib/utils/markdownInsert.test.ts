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

	it("breaks out of a paragraph of several lines after the cursor's line", () => {
		const text = "Line one\nline two\nline three"

		expect(insertMarkdownBlock(text, BLOCK, 11).text).toBe(
			`Line one\nline two\n\n${BLOCK}\n\nline three`
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
