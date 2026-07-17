import { describe, expect, it } from "vitest"
import { splitTopicHubBody } from "@/lib/content/guideTopicBody"

// #region splitTopicHubBody

describe("splitTopicHubBody", () => {
	it("splits framing from disclosure on a trailing ---", () => {
		const { intro, outro } = splitTopicHubBody(
			"Framing paragraph.\n\n---\n\nFull disclosure: I make Reckon."
		)

		expect(intro).toBe("Framing paragraph.")
		expect(outro).toBe("Full disclosure: I make Reckon.")
	})

	it("returns the whole body as intro when there is no break", () => {
		const { intro, outro } = splitTopicHubBody("Just framing, no disclosure.")

		expect(intro).toBe("Just framing, no disclosure.")
		expect(outro).toBeNull()
	})

	// The reference definition must ride with the disclosure that uses it — the
	// outro is rendered as its own markdown document.
	it("keeps a reference definition after the break in the outro", () => {
		const body =
			"Framing.\n\n---\n\nI make [Reckon][reckon].\n\n[reckon]: /projects/reckon"
		const { outro } = splitTopicHubBody(body)

		expect(outro).toContain("[reckon]: /projects/reckon")
	})

	// The disclosure is always the final block, so an earlier author-divider
	// stays in the intro and renders as its own rule.
	it("splits on the LAST break, leaving an earlier one in the intro", () => {
		const { intro, outro } = splitTopicHubBody(
			"One.\n\n---\n\nTwo.\n\n---\n\nDisclosure."
		)

		expect(intro).toBe("One.\n\n---\n\nTwo.")
		expect(outro).toBe("Disclosure.")
	})

	it("treats a trailing break with nothing after it as no split", () => {
		const { intro, outro } = splitTopicHubBody("Framing.\n\n---\n\n")

		expect(intro).toBe("Framing.\n\n---\n\n")
		expect(outro).toBeNull()
	})

	it("recognizes *** and ___ breaks too", () => {
		expect(splitTopicHubBody("A.\n\n***\n\nB.").outro).toBe("B.")
		expect(splitTopicHubBody("A.\n\n___\n\nB.").outro).toBe("B.")
	})

	// A `---` inside a paragraph (no blank line around it) isn't a thematic
	// break in markdown; but this splitter is line-based, so it would match a
	// bare `---` line. Guard the realistic case: an inline dash run isn't a line.
	it("does not split on dashes embedded in text", () => {
		const { outro } = splitTopicHubBody("A sentence — with an em-dash — here.")

		expect(outro).toBeNull()
	})

	it("trims surrounding blank lines off both parts", () => {
		const { intro, outro } = splitTopicHubBody(
			"Framing.\n\n\n---\n\n\nDisclosure.\n"
		)

		expect(intro).toBe("Framing.")
		expect(outro).toBe("Disclosure.")
	})
})

// #endregion
