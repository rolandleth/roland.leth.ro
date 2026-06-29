import { afterEach, describe, expect, it, vi } from "vitest"
import { fadeUp } from "@/lib/client/motion"
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
})
