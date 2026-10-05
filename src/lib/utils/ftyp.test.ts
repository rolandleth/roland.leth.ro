import { describe, expect, it } from "vitest"
import { ftypBox } from "@/test/mediaBytes"
import { FTYP_MAJOR_BRAND_OFFSET, ftypBrandAt, hasFtypBox } from "./ftyp"

describe("hasFtypBox", () => {
	it("recognizes a file that opens with an ftyp box", () => {
		expect(hasFtypBox(ftypBox("isom", []))).toBe(true)
	})

	it("refuses bytes with no ftyp tag", () => {
		expect(hasFtypBox(new Uint8Array(16))).toBe(false)
	})

	it("refuses an ftyp tag that is not at bytes 4-7", () => {
		const shifted = new Uint8Array(24)
		shifted.set(ftypBox("isom", []), 4)

		expect(hasFtypBox(shifted)).toBe(false)
	})

	it("refuses bytes too short to hold a major brand", () => {
		expect(hasFtypBox(ftypBox("isom", []).subarray(0, 11))).toBe(false)
		expect(hasFtypBox(new Uint8Array(0))).toBe(false)
	})

	it("reads a subarray from its own start", () => {
		const padded = new Uint8Array(32)
		padded.set(ftypBox("isom", []), 8)

		expect(hasFtypBox(padded.subarray(8))).toBe(true)
	})
})

describe("ftypBrandAt", () => {
	it("reads the major brand", () => {
		expect(ftypBrandAt(ftypBox("mp42", []), FTYP_MAJOR_BRAND_OFFSET)).toBe(
			"mp42"
		)
	})

	it("reads a compatible brand", () => {
		const box = ftypBox("isom", ["iso2", "avc1"])

		expect(ftypBrandAt(box, 16)).toBe("iso2")
		expect(ftypBrandAt(box, 20)).toBe("avc1")
	})

	it("keeps the space that pads a three-letter brand", () => {
		expect(ftypBrandAt(ftypBox("qt  ", []), FTYP_MAJOR_BRAND_OFFSET)).toBe(
			"qt  "
		)
	})
})
