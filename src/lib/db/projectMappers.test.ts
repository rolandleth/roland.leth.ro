import { describe, expect, it } from "vitest"
import { toFaqCreate, toLinkCreate, toSectionCreate } from "./projectMappers"

// #region toSectionCreate

describe("toSectionCreate", () => {
	it("returns undefined when sections is undefined (Prisma-skip)", () => {
		// Prisma treats `undefined` as "do not touch the column", so returning
		// undefined rather than an empty `create` array keeps update semantics
		// correct: an unchanged-sections payload doesn't wipe existing rows.
		expect(toSectionCreate(undefined)).toBeUndefined()
	})

	it("maps each section to a create clause with defaults applied", () => {
		const result = toSectionCreate([
			{ title: "T", description: "D" },
			{
				title: "T2",
				description: "D2",
				sortOrder: 5,
				images: [
					{ url: "https://example.com/a.png" },
					{
						url: "https://example.com/b.png",
						caption: "cap",
						sortOrder: 2,
					},
				],
			},
		])

		expect(result).toEqual({
			create: [
				{
					title: "T",
					description: "D",
					sortOrder: 0,
					images: undefined,
				},
				{
					title: "T2",
					description: "D2",
					sortOrder: 5,
					images: {
						create: [
							{ url: "https://example.com/a.png", caption: null, sortOrder: 0 },
							{
								url: "https://example.com/b.png",
								caption: "cap",
								sortOrder: 2,
							},
						],
					},
				},
			],
		})
	})
})

// #endregion

// #region toLinkCreate

describe("toLinkCreate", () => {
	it("returns undefined when links is undefined", () => {
		expect(toLinkCreate(undefined)).toBeUndefined()
	})

	it("defaults sortOrder to 0 when not provided", () => {
		const result = toLinkCreate([
			{ label: "App Store", url: "https://apps.apple.com/x" },
		])
		expect(result?.create[0].sortOrder).toBe(0)
	})

	it("preserves an explicit sortOrder", () => {
		const result = toLinkCreate([
			{ label: "GitHub", url: "https://github.com/x", sortOrder: 2 },
		])
		expect(result?.create[0].sortOrder).toBe(2)
	})
})

// #endregion

// #region toFaqCreate

describe("toFaqCreate", () => {
	it("returns undefined when faqs is undefined (Prisma-skip)", () => {
		expect(toFaqCreate(undefined)).toBeUndefined()
	})

	it("defaults sortOrder to 0 when not provided", () => {
		const result = toFaqCreate([
			{ question: "Is it free?", answer: "Yes, **forever**." },
		])
		expect(result?.create[0]).toEqual({
			question: "Is it free?",
			answer: "Yes, **forever**.",
			sortOrder: 0,
		})
	})

	it("preserves an explicit sortOrder", () => {
		const result = toFaqCreate([
			{ question: "How?", answer: "Like so.", sortOrder: 3 },
		])
		expect(result?.create[0].sortOrder).toBe(3)
	})
})

// #endregion
