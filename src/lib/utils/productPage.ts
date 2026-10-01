// Pure helpers for the own-app product page (`src/components/projects/product`).
// Kept free of React and of the data layer so the rules they encode (anchor
// ids, step detection, price labels, plan grouping) are unit-testable alone.

import { createSlug } from "@/lib/utils/format"
import type { ProjectOffer, ProjectPlan } from "@/lib/db/projects"

/**
 * The section count at which the page shows its section list. Below it the
 * page is short enough to scroll, and a list beside three sections is noise.
 */
export const TOC_MIN_SECTIONS = 6

/**
 * Ids the page uses for its own blocks. A section titled "FAQ" or "Pricing"
 * must not take one of them, or the table of contents and the "See how it
 * works" link would land on the wrong block.
 */
export const RESERVED_ANCHORS: ReadonlySet<string> = new Set([
	"faq",
	"pricing",
	"guides",
	"get",
	"main-content",
])

/**
 * One anchor id per section title, in order: the title's slug, made unique by
 * a `-2`, `-3`… suffix when an earlier section or a reserved id has it. A title
 * with no letters or digits (its slug is empty) gets `section-{n}`, n counting
 * from 1.
 */
export function sectionAnchors(
	titles: readonly string[],
	reserved: ReadonlySet<string> = RESERVED_ANCHORS
): string[] {
	const used = new Set(reserved)

	return titles.map((title, index) => {
		const base = createSlug(title) || `section-${index + 1}`
		let anchor = base
		let suffix = 2

		while (used.has(anchor)) {
			anchor = `${base}-${suffix}`
			suffix += 1
		}

		used.add(anchor)

		return anchor
	})
}

// A step heading in a section body: `### 1. Title`. Mirrors what
// `rehypeNumberedSteps` turns into the numbered list, so the hero's "See how
// it works" link only appears when the page has steps to land on.
const STEP_HEADING_LINE = /^###[ \t]+\d+\.[ \t]+\S/m

/** True when a section's markdown body holds at least one numbered step. */
export function hasNumberedSteps(markdown: string): boolean {
	return STEP_HEADING_LINE.test(markdown)
}

/**
 * A price for display: currency symbol, no decimals for a whole amount ("$0",
 * "$12"), two otherwise ("$6.99"). US formatting, since every stored price is
 * a US price and the page says so.
 */
export function formatPrice(price: string, currency: string): string {
	const amount = Number(price)
	const fractionDigits = Number.isInteger(amount) ? 0 : 2

	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency,
		minimumFractionDigits: fractionDigits,
		maximumFractionDigits: fractionDigits,
	}).format(amount)
}

const PERIOD_UNITS: Record<string, [singular: string, plural: string]> = {
	D: ["day", "days"],
	W: ["week", "weeks"],
	M: ["month", "months"],
	Y: ["year", "years"],
}

// The ISO-8601 durations `billingPeriod` holds in practice: one count, one unit.
const SIMPLE_DURATION = /^P(\d+)([DWMY])$/

/**
 * The label under a price: "a month" for `P1M`, "every 3 months" for `P3M`,
 * "once" when there's no billing period, and none for a free offer. A
 * duration this can't read (`P1Y6M`) gets no label rather than a wrong one.
 */
export function priceLabel(offer: {
	price: string
	billingPeriod?: string
}): string | null {
	if (Number(offer.price) === 0) {
		return null
	}

	if (offer.billingPeriod == null) {
		return "once"
	}

	const match = SIMPLE_DURATION.exec(offer.billingPeriod)

	if (match == null) {
		return null
	}

	const count = Number(match[1])
	const [singular, plural] = PERIOD_UNITS[match[2]]

	return count === 1 ? `a ${singular}` : `every ${count} ${plural}`
}

export interface PlanWithOffers {
	plan: ProjectPlan
	offers: ProjectOffer[]
}

function bySortOrder(a: { sortOrder?: number }, b: { sortOrder?: number }) {
	return (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
}

/**
 * Each plan with the offers that name it, both in `sortOrder`. Null when the
 * project has no plans, so the caller can fall back to a plain price list.
 * An offer naming no plan, or a plan that doesn't exist, is left out:
 * `projectCreateSchema` rejects both, so only a row written around the schema
 * can hold one.
 */
export function groupOffersByPlan(
	plans: readonly ProjectPlan[] | null,
	offers: readonly ProjectOffer[] | null
): PlanWithOffers[] | null {
	if (plans == null || plans.length === 0) {
		return null
	}

	const sortedOffers = [...(offers ?? [])].sort(bySortOrder)

	return [...plans].sort(bySortOrder).map((plan) => ({
		plan,
		offers: sortedOffers.filter((offer) => offer.plan === plan.name),
	}))
}
