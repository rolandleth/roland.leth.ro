import { motion } from "framer-motion"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fadeUp, NO_SCRIPT_FADE_RULE } from "@/lib/client/motion"
import { isBackForwardNavigation } from "@/lib/client/navigationType"

vi.mock("@/lib/client/navigationType", () => ({
	isBackForwardNavigation: vi.fn(() => false),
}))

const mockedIsBackForward = vi.mocked(isBackForwardNavigation)

describe("fadeUp", () => {
	afterEach(() => {
		mockedIsBackForward.mockReturnValue(false)
	})

	it("returns the default shape when only a delay is given", () => {
		expect(fadeUp(0)).toMatchObject({
			initial: { opacity: 0, y: -12 },
			animate: { opacity: 1, y: 0 },
			transition: { duration: 0.3, delay: 0, ease: "easeOut" },
		})
	})

	it("applies custom y and delay values", () => {
		expect(fadeUp(0.5, 20)).toMatchObject({
			initial: { opacity: 0, y: 20 },
			animate: { opacity: 1, y: 0 },
			transition: { duration: 0.3, delay: 0.5, ease: "easeOut" },
		})
	})

	it("skips the entrance (initial false) after a back/forward navigation", () => {
		mockedIsBackForward.mockReturnValue(true)

		expect(fadeUp(0.5, 20)).toMatchObject({
			initial: false,
			animate: { opacity: 1, y: 0 },
			transition: { duration: 0.3, delay: 0.5, ease: "easeOut" },
		})
	})

	it("marks the element for the no-JavaScript rule", () => {
		expect(fadeUp(0)).toMatchObject({ "data-fade": true })
	})
})

describe("fadeUp without JavaScript", () => {
	// What the prerender sends: the element at opacity 0 with the marker. The
	// rule has to match that element and outrank the inline style, or a visitor
	// without JavaScript sees nothing.
	const html = renderToStaticMarkup(createElement(motion.p, fadeUp(0), "Hello"))

	it("server-renders the element hidden, with the marker", () => {
		expect(html).toContain('data-fade="true"')
		expect(html).toMatch(/style="[^"]*opacity:0/)
	})

	it("selects the marker and overrides the inline opacity and slide", () => {
		expect(NO_SCRIPT_FADE_RULE).toMatch(/^\[data-fade\]\{/)
		expect(NO_SCRIPT_FADE_RULE).toContain("opacity:1!important")
		expect(NO_SCRIPT_FADE_RULE).toContain("transform:none!important")
	})
})
