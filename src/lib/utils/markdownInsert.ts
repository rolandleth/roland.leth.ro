import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"

export interface BlockInsertion {
	/** The text with the block in place. */
	text: string
	/** Where the block starts in `text`. */
	blockStart: number
}

/** Newlines a paragraph break needs: one ends the line, the second leaves it blank. */
const PARAGRAPH_BREAK_NEWLINES = 2

// Parse-only, built once: only the top-level blocks' positions are read.
const blockParser = unified().use(remarkParse).use(remarkGfm)

/**
 * Puts `block` into `text` as a paragraph of its own, near `cursor`. Nothing is
 * ever replaced or split. The unit is a top-level markdown block (a paragraph,
 * a list, a fenced code block, a quote, a table): a cursor at a block's start
 * puts the new one before it, a cursor anywhere inside puts it after the whole
 * block, and a cursor on a blank line between blocks puts it there. So it can't
 * land inside a sentence, a code block, a hard-wrapped paragraph or a list
 * (where it would restart the numbering), or inside the block a previous call
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

/**
 * The start of the top-level block `cursor` starts, the end of the one it sits
 * inside, and otherwise its own line's boundary (`lineBoundary`).
 */
function insertionPoint(text: string, cursor: number): number {
	for (const node of blockParser.parse(text).children) {
		const start = node.position?.start.offset
		const end = node.position?.end.offset

		if (start == null || end == null) {
			continue
		}

		if (cursor === start) {
			return start
		}

		if (cursor > start && cursor <= end) {
			return end
		}
	}

	return lineBoundary(text, cursor)
}

/** `cursor` itself at the start of a line, the end of its line otherwise. */
function lineBoundary(text: string, cursor: number): number {
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
