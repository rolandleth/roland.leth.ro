import { describe, expect, it } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { PRODUCT_PAGE_TEXT_KEYS } from "@/lib/api/schemas"
import { GREEN_BAND_THEME } from "@/test/fixtures"
import {
	toFaqCreate,
	toJsonColumnUpdate,
	toLinkCreate,
	toProductPageCreate,
	toSectionCreate,
} from "./projectMappers"

// #region toSectionCreate

describe("toSectionCreate", () => {
	it("returns undefined when sections is undefined (Prisma-skip)", () => {
		// Prisma treats `undefined` as "do not touch the column", so returning
		// undefined rather than an empty `create` array keeps update semantics
		// correct: an unchanged-sections payload doesn't wipe existing rows.
		expect(toSectionCreate(undefined)).toBeUndefined()
	})

	it("maps a text section with its layout and images, defaults applied", () => {
		const result = toSectionCreate([
			{ title: "T", description: "D", kind: "text", layout: "stacked" },
			{
				title: "T2",
				description: "D2",
				sortOrder: 5,
				kind: "text",
				layout: "split",
				images: [
					{ url: "https://example.com/a.png" },
					{
						url: "https://example.com/b.png",
						caption: "cap",
						alt: "A long description of the screenshot.",
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
					kind: "text",
					layout: "stacked",
					images: undefined,
				},
				{
					title: "T2",
					description: "D2",
					sortOrder: 5,
					kind: "text",
					layout: "split",
					images: {
						create: [
							{
								url: "https://example.com/a.png",
								caption: null,
								alt: null,
								sortOrder: 0,
							},
							{
								url: "https://example.com/b.png",
								caption: "cap",
								alt: "A long description of the screenshot.",
								sortOrder: 2,
							},
						],
					},
				},
			],
		})
	})

	it("orders images without a sortOrder by their position", () => {
		// A shared 0 would leave their order to the database.
		const result = toSectionCreate([
			{
				title: "T",
				description: "D",
				kind: "text",
				layout: "stacked",
				images: [
					{ url: "https://example.com/a.png" },
					{ url: "https://example.com/b.png" },
				],
			},
		])
		const section = result?.create[0]

		expect(
			section != null && "images" in section
				? section.images?.create.map((image) => image.sortOrder)
				: null
		).toEqual([0, 1])
	})

	it("maps a steps section to its items, each with its own images", () => {
		const result = toSectionCreate([
			{
				title: "How it works",
				kind: "steps",
				items: [
					{
						title: "Log a meal",
						description: "Type it.",
						images: [
							{ url: "https://example.com/log.png", alt: "The log sheet." },
						],
					},
					{ title: "Then how you feel", description: "Log it.", sortOrder: 7 },
				],
			},
		])

		expect(result).toEqual({
			create: [
				{
					title: "How it works",
					description: "",
					sortOrder: 0,
					kind: "steps",
					layout: null,
					items: {
						create: [
							{
								title: "Log a meal",
								description: "Type it.",
								sortOrder: 0,
								images: {
									create: [
										{
											url: "https://example.com/log.png",
											caption: null,
											alt: "The log sheet.",
											sortOrder: 0,
										},
									],
								},
							},
							{
								title: "Then how you feel",
								description: "Log it.",
								sortOrder: 7,
								images: undefined,
							},
						],
					},
				},
			],
		})
	})

	it("maps a pricing section to its note alone", () => {
		const result = toSectionCreate([
			{ title: "Free and paid", kind: "pricing", description: "US prices." },
			{ title: "Pricing", kind: "pricing" },
		])

		expect(result).toEqual({
			create: [
				{
					title: "Free and paid",
					description: "US prices.",
					sortOrder: 0,
					kind: "pricing",
					layout: null,
				},
				{
					title: "Pricing",
					description: "",
					sortOrder: 0,
					kind: "pricing",
					layout: null,
				},
			],
		})
	})
})

// #endregion

// #region toProductPageCreate

describe("toProductPageCreate", () => {
	it("writes every text field as null and both Json columns as SQL NULL when absent", () => {
		// A bare `null` on a Json column means "filter on JSON null" to Prisma, so
		// absent Json values must be `Prisma.DbNull`, as for `offers`.
		expect(toProductPageCreate({})).toEqual({
			metaDescription: null,
			heroEyebrow: null,
			heroHeadline: null,
			heroImageAlt: null,
			storeNote: null,
			closingHeadline: null,
			closingBody: null,
			disclaimer: null,
			plans: Prisma.DbNull,
			palette: Prisma.DbNull,
		})
	})

	it("writes exactly the schema's product-page columns, so create drops none", () => {
		expect(Object.keys(toProductPageCreate({})).sort()).toEqual(
			[...PRODUCT_PAGE_TEXT_KEYS, "plans", "palette"].sort()
		)
	})

	it("writes an explicit null Json value as SQL NULL", () => {
		const result = toProductPageCreate({ plans: null, palette: null })

		expect(result.plans).toBe(Prisma.DbNull)
		expect(result.palette).toBe(Prisma.DbNull)
	})

	it("passes set values through unchanged", () => {
		const plans = [{ name: "Free", features: ["Logging."], sortOrder: 1 }]
		const palette = { light: GREEN_BAND_THEME, dark: GREEN_BAND_THEME }

		const result = toProductPageCreate({
			metaDescription: "Meta.",
			heroEyebrow: "Food and symptom journal",
			heroHeadline: "Find which foods to suspect",
			heroImageAlt: "Four cards.",
			storeNote: "Logging is free.",
			closingHeadline: "10 seconds a meal",
			closingBody: "Three weeks.",
			disclaimer: "Not a medical device.",
			plans,
			palette,
		})

		expect(result).toEqual({
			metaDescription: "Meta.",
			heroEyebrow: "Food and symptom journal",
			heroHeadline: "Find which foods to suspect",
			heroImageAlt: "Four cards.",
			storeNote: "Logging is free.",
			closingHeadline: "10 seconds a meal",
			closingBody: "Three weeks.",
			disclaimer: "Not a medical device.",
			plans,
			palette,
		})
	})

	it("writes an explicit null text field as null", () => {
		expect(toProductPageCreate({ heroEyebrow: null }).heroEyebrow).toBeNull()
	})
})

// #endregion

// #region toJsonColumnUpdate

describe("toJsonColumnUpdate", () => {
	it("leaves an absent value absent, so the update keeps the column", () => {
		expect(toJsonColumnUpdate(undefined)).toBeUndefined()
	})

	it("turns null into SQL NULL, which Prisma needs for a Json column", () => {
		expect(toJsonColumnUpdate(null)).toBe(Prisma.DbNull)
	})

	it("passes a value through", () => {
		const plans = [{ name: "Free", features: ["Logging."] }]

		expect(toJsonColumnUpdate(plans)).toBe(plans)
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
