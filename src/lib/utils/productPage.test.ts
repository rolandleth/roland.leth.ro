import { describe, expect, it } from "vitest"
import {
	formatPrice,
	groupOffersByPlan,
	hasNumberedSteps,
	priceLabel,
	RESERVED_ANCHORS,
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
		expect(sectionAnchors(["FAQ", "Pricing"])).toEqual(["faq-2", "pricing-2"])
	})

	it("gives a title with no letters or digits a positional id", () => {
		expect(sectionAnchors(["Overview", "計算機"])).toEqual([
			"overview",
			"section-2",
		])
	})

	it("reserves the ids the page uses for its own blocks", () => {
		expect([...RESERVED_ANCHORS]).toEqual(
			expect.arrayContaining(["faq", "pricing", "guides", "main-content"])
		)
	})
})

// #endregion

// #region hasNumberedSteps

describe("hasNumberedSteps", () => {
	it("finds a `### 1. Title` line anywhere in the body", () => {
		expect(hasNumberedSteps("Intro.\n\n### 1. Log a meal\n\nBody.")).toBe(true)
	})

	it("ignores an unnumbered `###` heading", () => {
		expect(hasNumberedSteps("### Log a meal")).toBe(false)
	})

	it("ignores numbered `##` and `####` headings", () => {
		expect(hasNumberedSteps("## 1. Big\n#### 2. Small")).toBe(false)
	})

	it("ignores a number with no title after it", () => {
		expect(hasNumberedSteps("### 1.")).toBe(false)
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
