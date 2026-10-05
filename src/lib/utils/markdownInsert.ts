export interface BlockInsertion {
	/** The text with the block in place. */
	text: string
	/** Where the block starts in `text`. */
	blockStart: number
}

/** Newlines a paragraph break needs: one ends the line, the second leaves it blank. */
const PARAGRAPH_BREAK_NEWLINES = 2

/**
 * Puts `block` into `text` as a paragraph of its own, near `cursor`. Nothing is
 * ever replaced or split: a cursor at the start of a line puts the block before
 * that line, and a cursor anywhere else puts it after the cursor's line. So a
 * block can't land inside a sentence, or inside the block a previous call
 * inserted when the cursor was left in it.
 *
 * Adds only the blank lines that are missing around the block, so inserting
 * between two paragraphs or at either end never stacks empty lines.
 *
 * `cursor` is clamped to the text, so a position remembered from before the
 * text changed can't point outside it.
 */
export function insertMarkdownBlock(
	text: string,
	block: string,
	cursor: number
): BlockInsertion {
	const at = insertionPoint(text, clamp(cursor, text.length))
	const before = text.slice(0, at)
	const after = text.slice(at)
	const lead = before === "" ? "" : missingNewlines(trailingNewlines(before))
	const trail = after === "" ? "" : missingNewlines(leadingNewlines(after))

	return {
		text: `${before}${lead}${block}${trail}${after}`,
		blockStart: before.length + lead.length,
	}
}

/** `cursor` itself at the start of a line, the end of its line otherwise. */
function insertionPoint(text: string, cursor: number): number {
	if (cursor === 0 || text[cursor - 1] === "\n") {
		return cursor
	}

	const lineEnd = text.indexOf("\n", cursor)

	return lineEnd === -1 ? text.length : lineEnd
}

function clamp(offset: number, length: number): number {
	return Math.min(Math.max(offset, 0), length)
}

function trailingNewlines(text: string): number {
	let count = 0

	while (count < text.length && text[text.length - 1 - count] === "\n") {
		count++
	}

	return count
}

function leadingNewlines(text: string): number {
	let count = 0

	while (count < text.length && text[count] === "\n") {
		count++
	}

	return count
}

/** The newlines still needed for a paragraph break where `present` already are. */
function missingNewlines(present: number): string {
	return "\n".repeat(Math.max(PARAGRAPH_BREAK_NEWLINES - present, 0))
}
