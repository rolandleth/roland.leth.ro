import { describe, expect, it } from "vitest"
import { fadeUp } from "@/lib/motion"

describe("fadeUp", () => {
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
})
