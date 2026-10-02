// Pure helpers for the own-app product page (`src/components/projects/product`).
// Kept free of React and of the data layer so the rules they encode (anchor
// ids, gallery grouping, price labels, plan grouping) are unit-testable alone.

import { ProjectSectionKind } from "@/generated/prisma/enums"
import { createSlug } from "@/lib/utils/format"
import type { GalleryGroup } from "@/lib/client/gallery"
import type { ProjectOffer, ProjectPlan } from "@/lib/db/projects"

/**
 * Ids the page always uses for its own blocks. A section titled "FAQ" must not
 * take one of them, or the table of contents and the "See how it works" link
 * would land on the wrong block.
 */
export const RESERVED_ANCHORS: ReadonlySet<string> = new Set([
	"faq",
	"guides",
	"get",
	"main-content",
])

/**
 * The automatic "Pricing" block's id. Reserved only on a page that shows the
 * block: with a `pricing` section of its own, the page has no such block, and
 * a section titled "Pricing" should get the plain `#pricing`, not `#pricing-2`.
 */
export const AUTOMATIC_PRICING_ANCHOR = "pricing"

/** The ids a section can't take on this page; see the two constants above. */
export function reservedAnchors(
	hasAutomaticPricing: boolean
): ReadonlySet<string> {
	return hasAutomaticPricing
		? new Set([...RESERVED_ANCHORS, AUTOMATIC_PRICING_ANCHOR])
		: RESERVED_ANCHORS
}

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

type GalleryGroupImage = GalleryGroup["images"][number]

/** The minimum a section needs to expose for {@link productGalleryGroups}. */
interface GalleryGroupSection {
	title: string
	kind: ProjectSectionKind
	images: readonly GalleryGroupImage[]
	items: readonly { title: string; images: readonly GalleryGroupImage[] }[]
}

export interface ProductGalleryGroups {
	/** Every gallery on the page, in page order; flatten with `flattenGroups`. */
	groups: GalleryGroup[]
	/** Each section's gallery, by index into `groups`; null for none. */
	sectionGroups: (number | null)[]
	/** Each section's steps' galleries, by index into `groups`; null for none. */
	stepGroups: (number | null)[][]
}

/**
 * The page's galleries, in page order: one for each `text` section with images
 * and one for each step with images. A `steps` section shows its images on its
 * steps, and a `pricing` section has none. Images go in their own table per
 * kind, so each group prefixes its image keys with the table it came from.
 */
export function productGalleryGroups(
	sections: readonly GalleryGroupSection[]
): ProductGalleryGroups {
	const groups: GalleryGroup[] = []
	const sectionGroups: (number | null)[] = []
	const stepGroups: (number | null)[][] = []

	function addGroup(
		title: string,
		keyPrefix: string,
		images: readonly GalleryGroupImage[]
	): number | null {
		if (images.length === 0) {
			return null
		}

		groups.push({ title, keyPrefix, images })

		return groups.length - 1
	}

	for (const section of sections) {
		switch (section.kind) {
			case ProjectSectionKind.text:
				sectionGroups.push(
					addGroup(section.title, "section-image", section.images)
				)
				stepGroups.push([])
				break
			case ProjectSectionKind.steps:
				sectionGroups.push(null)
				stepGroups.push(
					section.items.map((item) =>
						addGroup(item.title, "step-image", item.images)
					)
				)
				break
			case ProjectSectionKind.pricing:
				sectionGroups.push(null)
				stepGroups.push([])
				break
		}
	}

	return { groups, sectionGroups, stepGroups }
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

interface SavingsOffer {
	price: string
	priceCurrency: string
	billingPeriod?: string
}

/**
 * How much cheaper `offer` is per month than the shortest-billed paid price
 * beside it in the same currency, as a whole percentage rounded down, so it
 * never overstates: 25 for $108 a year against $12 a month. Null when there's
 * nothing honest to say: `offer` isn't billed in months or years (a one-time
 * price, a weekly one), no other price is, or the saving is under 1%. Cents
 * and integers throughout, so float error can't round 25 down to 24.
 */
export function savingsPercent(
	offer: SavingsOffer,
	others: readonly SavingsOffer[]
): number | null {
	const months = billingMonths(offer.billingPeriod)

	if (months == null) {
		return null
	}

	const base = others
		.filter(
			(other) =>
				other !== offer &&
				other.priceCurrency === offer.priceCurrency &&
				Number(other.price) > 0
		)
		.map((other) => ({
			cents: priceInCents(other.price),
			months: billingMonths(other.billingPeriod),
		}))
		.filter(
			(other): other is { cents: number; months: number } =>
				other.months != null && other.months < months
		)
		.sort((a, b) => a.months - b.months)[0]

	if (base == null) {
		return null
	}

	// 1 - (offer per month) / (base per month), both sides scaled to integers.
	const baseTotal = base.cents * months
	const offerTotal = priceInCents(offer.price) * base.months
	const percent = Math.floor((100 * (baseTotal - offerTotal)) / baseTotal)

	return percent >= 1 ? percent : null
}

/** `P1M` → 1, `P3M` → 3, `P1Y` → 12; null for no period, days, weeks, or `P1Y6M`. */
function billingMonths(billingPeriod: string | undefined): number | null {
	const match =
		billingPeriod == null ? null : SIMPLE_DURATION.exec(billingPeriod)

	if (match == null) {
		return null
	}

	const count = Number(match[1])

	switch (match[2]) {
		case "M":
			return count
		case "Y":
			return count * 12
		default:
			return null
	}
}

function priceInCents(price: string): number {
	return Math.round(Number(price) * 100)
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
