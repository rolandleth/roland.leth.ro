import { describe, expect, it } from "vitest"
import { randomShortId } from "@/lib/utils/randomShortId"

/**
 * The id every correlated log line and every `respondInternalError` body carries.
 * Nothing asserted its shape, so a bad refactor of the `slice` would silently
 * shrink the entropy behind every correlation id on the site without failing
 * anything.
 */

describe("randomShortId", () => {
	it("is 12 characters", () => {
		// The length is what the log format and the client-facing `requestId`
		// both assume; a shorter one collides sooner and a longer one is noise.
		expect(randomShortId()).toHaveLength(12)
	})

	it("uses only lowercase hex", () => {
		// URL-safe and copy-pasteable out of a log line without escaping — which
		// is the point of stripping the UUID's dashes rather than keeping them.
		expect(randomShortId()).toMatch(/^[0-9a-f]{12}$/)
	})

	it("does not repeat across a run", () => {
		// 12 hex chars is 48 bits. Collisions across 1000 draws would mean the
		// generator is not actually random — the failure mode a `slice` refactor
		// would produce is a constant or a short prefix, which this catches.
		const ids = new Set(Array.from({ length: 1000 }, () => randomShortId()))

		expect(ids.size).toBe(1000)
	})

	it("does not carry the UUID's dashes through", () => {
		// The dashes would eat 4 of the 12 characters and drop the entropy from
		// 48 bits to 32 while the length assertion above still passed.
		expect(randomShortId()).not.toContain("-")
	})
})
