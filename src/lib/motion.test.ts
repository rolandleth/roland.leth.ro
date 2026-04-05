import { describe, expect, it } from "vitest"
import { fadeUp } from "@/lib/motion"

describe("fadeUp", () => {
	it("returns initial opacity of 0", () => {
		expect(fadeUp(0).initial.opacity).toBe(0)
	})

	it("returns animate opacity of 1", () => {
		expect(fadeUp(0).animate.opacity).toBe(1)
	})

	it("returns animate y of 0", () => {
		expect(fadeUp(0).animate.y).toBe(0)
	})

	it("defaults y to -12", () => {
		expect(fadeUp(0).initial.y).toBe(-12)
	})

	it("accepts a custom y value", () => {
		expect(fadeUp(0, 20).initial.y).toBe(20)
	})

	it("accepts a negative custom y value", () => {
		expect(fadeUp(0, -24).initial.y).toBe(-24)
	})

	it("passes delay to transition", () => {
		expect(fadeUp(0.5).transition.delay).toBe(0.5)
	})

	it("passes zero delay to transition", () => {
		expect(fadeUp(0).transition.delay).toBe(0)
	})

	it("sets transition duration to 0.3", () => {
		expect(fadeUp(0).transition.duration).toBe(0.3)
	})

	it("sets transition ease to easeOut", () => {
		expect(fadeUp(0).transition.ease).toBe("easeOut")
	})
})
