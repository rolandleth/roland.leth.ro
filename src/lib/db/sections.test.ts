import { describe, expect, it } from "vitest"
import { isValidSection } from "@/lib/db/sections"

describe("isValidSection", () => {
	it("returns true for 'tech'", () => {
		expect(isValidSection("tech")).toBe(true)
	})

	it("returns true for 'life'", () => {
		expect(isValidSection("life")).toBe(true)
	})

	it("returns false for an unknown section", () => {
		expect(isValidSection("food")).toBe(false)
	})

	it("returns false for an empty string", () => {
		expect(isValidSection("")).toBe(false)
	})

	it("is case-sensitive — rejects uppercase variants", () => {
		expect(isValidSection("Tech")).toBe(false)
		expect(isValidSection("LIFE")).toBe(false)
	})
})
