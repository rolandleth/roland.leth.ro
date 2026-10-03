import { describe, expect, it } from "vitest"
import { ProjectSectionKind } from "@/generated/prisma/enums"
import {
	formatPrice,
	groupOffersByPlan,
	priceLabel,
	productGalleryGroups,
	reservedAnchors,
	RESERVED_ANCHORS,
	savingsPercent,
	sectionAnchors,
} from "./productPage"

// #region sectionAnchors

describe("sectionAnchors", () => {
	it("slugs each title", () => {
		expect(
			sectionAnchors(["Guessing cuts too much", "When it isn't the food"])
		).toEqual(["guessing-cuts-too-much", "when-it-isnt-the-food"])
	})

	it("suffixes a repeated title so every id is unique", () => {
		expect(
			sectionAnchors(["How it works", "How it works", "How it works"])
		).toEqual(["how-it-works", "how-it-works-2", "how-it-works-3"])
	})

	it("keeps a section off the page's own ids", () => {
		// A section called "FAQ" would otherwise share the FAQ block's id.
		expect(sectionAnchors(["FAQ", "Pricing"], reservedAnchors(true))).toEqual([
			"faq-2",
			"pricing-2",
		])
	})

	it("lets a section have `pricing` when the page has no automatic Pricing block", () => {
		expect(sectionAnchors(["FAQ", "Pricing"], reservedAnchors(false))).toEqual([
			"faq-2",
			"pricing",
		])
	})

	it("gives a title with no letters or digits a positional id", () => {
		expect(sectionAnchors(["Overview", "計算機"])).toEqual([
			"overview",
			"section-2",
		])
	})

	it("reserves the ids the page uses for its own blocks", () => {
		expect([...RESERVED_ANCHORS]).toEqual(
			expect.arrayContaining(["faq", "guides", "main-content"])
		)
	})
})

// #endregion

// #region productGalleryGroups

describe("productGalleryGroups", () => {
	function image(id: number) {
		return { id, url: `/${id}.png`, caption: null, alt: null }
	}

	it("gives each text section with images, and each step with images, a gallery in page order", () => {
		const { groups, sectionGroups, stepGroups } = productGalleryGroups([
			{
				title: "Guessing",
				kind: ProjectSectionKind.text,
				images: [image(1)],
				items: [],
			},
			{
				title: "How it works",
				kind: ProjectSectionKind.steps,
				images: [],
				items: [
					{ title: "Log", images: [image(2), image(3)] },
					{ title: "Feel", images: [] },
					{ title: "Wait", images: [image(4)] },
				],
			},
			{
				title: "Test a suspect",
				kind: ProjectSectionKind.text,
				images: [],
				items: [],
			},
			{
				title: "Free and paid",
				kind: ProjectSectionKind.pricing,
				images: [],
				items: [],
			},
		])

		expect(groups.map(({ title, keyPrefix }) => [title, keyPrefix])).toEqual([
			["Guessing", "section-image"],
			["Log", "step-image"],
			["Wait", "step-image"],
		])
		expect(sectionGroups).toEqual([0, null, null, null])
		expect(stepGroups).toEqual([[], [1, null, 2], [], []])
	})

	it("returns no galleries for a page without images", () => {
		expect(
			productGalleryGroups([
				{
					title: "A",
					kind: ProjectSectionKind.text,
					images: [],
					items: [],
				},
			])
		).toEqual({ groups: [], sectionGroups: [null], stepGroups: [[]] })
	})
})

// #endregion

// #region formatPrice

describe("formatPrice", () => {
	it("drops the decimals of a whole amount", () => {
		expect(formatPrice("0", "USD")).toBe("$0")
		expect(formatPrice("12.00", "USD")).toBe("$12")
		expect(formatPrice("249", "USD")).toBe("$249")
	})

	it("keeps two decimals otherwise", () => {
		expect(formatPrice("6.99", "USD")).toBe("$6.99")
		expect(formatPrice("4.5", "USD")).toBe("$4.50")
	})

	it("uses the offer's currency", () => {
		expect(formatPrice("9.99", "EUR")).toBe("€9.99")
	})
})

// #endregion

// #region priceLabel

describe("priceLabel", () => {
	it("reads one-unit periods as 'a month' and 'a year'", () => {
		expect(priceLabel({ price: "6.99", billingPeriod: "P1M" })).toBe("a month")
		expect(priceLabel({ price: "39.99", billingPeriod: "P1Y" })).toBe("a year")
		expect(priceLabel({ price: "1", billingPeriod: "P1W" })).toBe("a week")
	})

	it("reads a multi-unit period as 'every N units'", () => {
		expect(priceLabel({ price: "15", billingPeriod: "P3M" })).toBe(
			"every 3 months"
		)
	})

	it("labels a paid offer with no period 'once'", () => {
		expect(priceLabel({ price: "89.99" })).toBe("once")
	})

	it("gives a free offer no label, period or not", () => {
		expect(priceLabel({ price: "0" })).toBeNull()
		expect(priceLabel({ price: "0.00", billingPeriod: "P1M" })).toBeNull()
	})

	it("gives a period it can't read no label rather than a wrong one", () => {
		expect(priceLabel({ price: "9", billingPeriod: "P1Y6M" })).toBeNull()
	})
})

// #endregion

// #region savingsPercent

describe("savingsPercent", () => {
	const monthly = { price: "12.00", priceCurrency: "USD", billingPeriod: "P1M" }
	const yearly = { price: "108.00", priceCurrency: "USD", billingPeriod: "P1Y" }
	const lifetime = { price: "249.00", priceCurrency: "USD" }

	it("compares a yearly price against the monthly one, per month", () => {
		expect(savingsPercent(yearly, [monthly, yearly, lifetime])).toBe(25)
	})

	it("rounds down, so it never overstates the saving", () => {
		// 39.99 against 12 × 6.99 = 83.88 is 52.3% off.
		expect(
			savingsPercent({ ...yearly, price: "39.99" }, [
				{ ...monthly, price: "6.99" },
			])
		).toBe(52)
	})

	it("compares against the shortest period when there are several", () => {
		// The year is $9 a month: 10% under the quarter's $10, 25% under the
		// monthly $12. The base is the monthly price, the shortest period.
		const quarterly = { ...monthly, price: "30.00", billingPeriod: "P3M" }

		expect(savingsPercent(yearly, [quarterly, monthly])).toBe(25)
	})

	it("says nothing for a one-time price, which has no per-month cost", () => {
		expect(savingsPercent(lifetime, [monthly, yearly])).toBeNull()
	})

	it("says nothing without a shorter paid price in the same currency", () => {
		expect(savingsPercent(yearly, [yearly, lifetime])).toBeNull()
		expect(
			savingsPercent(yearly, [{ ...monthly, priceCurrency: "EUR" }])
		).toBeNull()
		expect(savingsPercent(yearly, [{ ...monthly, price: "0" }])).toBeNull()
		// The monthly price is the shorter one: it saves nothing against the year.
		expect(savingsPercent(monthly, [monthly, yearly])).toBeNull()
	})

	it("says nothing for a period it can't turn into months", () => {
		expect(
			savingsPercent(yearly, [{ ...monthly, billingPeriod: "P1W" }])
		).toBeNull()
		expect(
			savingsPercent({ ...yearly, billingPeriod: "P1Y6M" }, [monthly])
		).toBeNull()
	})

	it("says nothing when the longer period costs as much or more", () => {
		expect(savingsPercent({ ...yearly, price: "144.00" }, [monthly])).toBeNull()
		expect(savingsPercent({ ...yearly, price: "150.00" }, [monthly])).toBeNull()
		// 143.00 against 144.00 is 0.7%: under 1%, so nothing.
		expect(savingsPercent({ ...yearly, price: "143.00" }, [monthly])).toBeNull()
	})
})

// #endregion

// #region groupOffersByPlan

describe("groupOffersByPlan", () => {
	const plans = [
		{ name: "Insights", features: ["Suspects."], sortOrder: 2 },
		{ name: "Free, forever", features: ["Meals."], sortOrder: 1 },
	]
	const offers = [
		{
			name: "Insights, yearly",
			plan: "Insights",
			price: "39.99",
			priceCurrency: "USD",
			sortOrder: 3,
		},
		{
			name: "Free",
			plan: "Free, forever",
			price: "0",
			priceCurrency: "USD",
			sortOrder: 1,
		},
		{
			name: "Insights, monthly",
			plan: "Insights",
			price: "6.99",
			priceCurrency: "USD",
			sortOrder: 2,
		},
	]

	it("returns null when the project has no plans", () => {
		expect(groupOffersByPlan(null, offers)).toBeNull()
		expect(groupOffersByPlan([], offers)).toBeNull()
	})

	it("orders the plans and each plan's offers by sortOrder", () => {
		const grouped = groupOffersByPlan(plans, offers)

		expect(grouped?.map(({ plan }) => plan.name)).toEqual([
			"Free, forever",
			"Insights",
		])
		expect(grouped?.[1].offers.map((offer) => offer.name)).toEqual([
			"Insights, monthly",
			"Insights, yearly",
		])
	})

	it("gives a plan no offers when none name it", () => {
		expect(groupOffersByPlan(plans, null)?.[0].offers).toEqual([])
	})

	it("leaves out an offer that names no plan", () => {
		const grouped = groupOffersByPlan(plans, [
			{ name: "Stray", price: "1", priceCurrency: "USD" },
		])

		expect(grouped?.flatMap(({ offers: planOffers }) => planOffers)).toEqual([])
	})
})

// #endregion
