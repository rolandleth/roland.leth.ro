// Splits a topic hub's markdown body around its trailing thematic break, so the
// page can render the framing above the guide list and the disclosure below it.
//
// A topic hub is a landing page with structured chrome (the guide list) that a
// plain guide doesn't have. Its disclosure reads as pushy stuck mid-body, before
// the list — so the author writes it after a `---`, and the page renders
// everything before the break as intro (above the list) and everything after as
// outro (below it). The `---` does double duty: the split point here, and the
// visual separator (rendered as the outro block's top border) that matches the
// `<hr>` a guide's own `---` produces inline.

const THEMATIC_BREAK = /^(?:-{3,}|\*{3,}|_{3,})$/

/**
 * Splits `body` on its LAST thematic-break line. Returns `{ intro, outro }`,
 * with `outro` null when there's no break (the whole body is framing) — so a
 * hub without a disclosure renders unchanged.
 *
 * The LAST break, not the first: the disclosure is always the final block, and
 * any earlier `---` an author used as a real in-body divider should stay in the
 * intro and render as its own `<hr>`. A break with nothing but whitespace after
 * it isn't a split (a stray trailing rule), so it falls back to no outro.
 */
export function splitTopicHubBody(body: string): {
	intro: string
	outro: string | null
} {
	const lines = body.split("\n")

	let breakIndex = -1

	for (let index = lines.length - 1; index >= 0; index -= 1) {
		if (THEMATIC_BREAK.test(lines[index].trim())) {
			breakIndex = index
			break
		}
	}

	if (breakIndex === -1) {
		return { intro: body, outro: null }
	}

	const outro = lines
		.slice(breakIndex + 1)
		.join("\n")
		.trim()

	if (outro === "") {
		return { intro: body, outro: null }
	}

	const intro = lines.slice(0, breakIndex).join("\n").trimEnd()

	return { intro, outro }
}
