// Pure builders for the project detail page's schema.org JSON-LD. Kept I/O-free
// and separate from the page so the shapes are unit-testable and the page stays
// a thin server component. Consumed by `src/app/projects/[slug]/page.tsx`.

import { jsonLdImageUrl, personFor } from "@/lib/content/jsonLd"
import type { ProjectDetail, ProjectOffer } from "@/lib/db/projects"

// Buckets that represent installable apps (vs. Web/OpenSource projects). Only
// these emit `SoftwareApplication` markup; a website or library would be
// mislabeled as an app.
const APP_BUCKETS: ReadonlySet<ProjectDetail["bucket"]> = new Set([
	"iOS",
	"Mac",
])

/**
 * Builds `FAQPage` JSON-LD from a project's FAQs, or `null` when there are none
 * (callers skip the `<script>` entirely). Self-contained Q&A pairs are what AI
 * answer engines extract and cite, so this is the highest-leverage block.
 */
export function buildFaqJsonLd(
	faqs: { question: string; answer: string }[]
): Record<string, unknown> | null {
	if (faqs.length === 0) {
		return null
	}

	return {
		"@context": "https://schema.org",
		"@type": "FAQPage",
		mainEntity: faqs.map((f) => ({
			"@type": "Question",
			name: f.question,
			acceptedAnswer: { "@type": "Answer", text: f.answer },
		})),
	}
}

/**
 * Builds `SoftwareApplication` JSON-LD for app-bucket projects (iOS/Mac), or
 * `null` for Web/OpenSource so non-apps don't emit app markup. When the project
 * carries `offers`, an `AggregateOffer` advertises the price range. `image` is
 * the resolved OG asset, absolutized against `base` (a legacy `/images/…` path
 * would otherwise emit an invalid relative URL); falls back to the site card
 * when the project has none, matching its `og:image`. `base` is the site origin
 * from `getSiteUrl()`, passed in so the builder stays pure.
 */
export function buildSoftwareApplicationJsonLd(
	project: ProjectDetail,
	image: string | null,
	base: string
): Record<string, unknown> | null {
	if (!APP_BUCKETS.has(project.bucket)) {
		return null
	}

	const { name, summary, bucket, offers, slug, applicationCategory } = project

	const jsonLd: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name,
		description: summary,
		operatingSystem: bucket === "iOS" ? "iOS" : "macOS",
		url: `${base}/projects/${slug}`,
		author: personFor(base),
	}

	// Category is manifest-driven, not inferred — omit when unset rather than
	// assert a wrong one (e.g. labelling a utility a "BusinessApplication").
	if (applicationCategory !== null) {
		jsonLd.applicationCategory = applicationCategory
	}

	// Always present: a project with no asset of its own names the site card, the
	// same one its `og:image` advertises. See `jsonLdImageUrl`.
	jsonLd.image = jsonLdImageUrl(image, base)

	const offerNode = buildOfferNode(offers, project.isDiscontinued)

	if (offerNode !== null) {
		jsonLd.offers = offerNode
	}

	return jsonLd
}

/**
 * Maps a project's price points to the right schema.org offer shape:
 * `null` when there are none, a single `Offer` for one price point (an
 * upfront-paid or free app — free is an explicit `"0"`), an `AggregateOffer`
 * spanning low→high when every price shares one currency, or a plain array of
 * `Offer` nodes when currencies differ (AggregateOffer asserts one currency for
 * the whole range, so multi-currency would mislabel a bound). Price strings are
 * preserved verbatim so "12.00" stays "12.00".
 *
 * `isDiscontinued` marks every emitted node `schema:Discontinued`. The prices
 * stay: they're what the app sold for, and dropping `offers` outright would lose
 * that while saying nothing about availability. See `availabilityFor`.
 *
 * A discontinued project takes the array-of-`Offer`s shape even when an
 * `AggregateOffer` would otherwise apply. `AggregateOffer` subclasses `Offer`,
 * so schema.org permits `availability` on it — but consumers that read only the
 * documented aggregate fields (`lowPrice`, `highPrice`, `priceCurrency`,
 * `offerCount`) drop it, and that branch emits no per-`Offer` node to carry it
 * instead. A multi-tier app that's been pulled would put its only Discontinued
 * signal on the node least likely to be read. The price range is the thing worth
 * losing here: it's a presentational nicety, and availability is the claim.
 */
function buildOfferNode(
	offers: ProjectOffer[] | null,
	isDiscontinued: boolean
): Record<string, unknown> | Record<string, unknown>[] | null {
	if (offers === null || offers.length === 0) {
		return null
	}

	if (offers.length === 1) {
		return toOfferNode(offers[0], isDiscontinued)
	}

	// Two reasons to skip the aggregate, both ending in the same shape — an array
	// of `Offer` nodes, which asserts no range:
	//
	//   - Mixed currencies: AggregateOffer asserts one `priceCurrency` across its
	//     lowPrice/highPrice bounds, so a mixed set would mislabel a bound.
	//   - Discontinued: the aggregate is where `availability` goes to be ignored
	//     (see the doc comment above).
	const currencies = new Set(offers.map((offer) => offer.priceCurrency))

	if (currencies.size > 1 || isDiscontinued) {
		return offers.map((offer) => toOfferNode(offer, isDiscontinued))
	}

	// `Number(price)` is safe without a guard because `projectOfferSchema`'s
	// `/^\d+(\.\d{1,2})?$/` is the contract for this column, and both write paths
	// enforce it: `POST/PUT /api/admin/projects` and `scripts/import-projects.ts`,
	// which parses the manifest through the same `projectCreateSchema`. A
	// read-side re-check here would be unreachable through any sanctioned write —
	// untestable in production, and a second, weaker statement of a rule the
	// schema already owns. Loosen the regex (a `"free"` sentinel, locale decimals)
	// and the AggregateOffer bounds below are what must change with it.
	const sorted = [...offers].sort((a, b) => Number(a.price) - Number(b.price))

	// De-dupe by (price, currency, billing period) so two identical rows (e.g. a
	// manifest listing the same tier twice) don't inflate `offerCount` past the
	// number of distinct offers schema.org expects.
	const offerCount = new Set(
		offers.map(
			(offer) =>
				`${offer.price}|${offer.priceCurrency}|${offer.billingPeriod ?? ""}`
		)
	).size

	// No `availability`: the guard above sends every discontinued project down
	// the array path, so this branch is the live-project case, and a live project
	// asserts nothing about availability (see `availabilityFor`).
	return {
		"@type": "AggregateOffer",
		priceCurrency: sorted[0].priceCurrency,
		lowPrice: sorted[0].price,
		highPrice: sorted[sorted.length - 1].price,
		offerCount,
	}
}

/** Maps a single price point to a schema.org `Offer` node. */
function toOfferNode(
	offer: ProjectOffer,
	isDiscontinued: boolean
): Record<string, unknown> {
	return {
		"@type": "Offer",
		price: offer.price,
		priceCurrency: offer.priceCurrency,
		...availabilityFor(isDiscontinued),
	}
}

/**
 * `availability` for an offer node, spread in so the key is absent rather than
 * `undefined` when it doesn't apply.
 *
 * Only the discontinued case is asserted. A live project gets no `availability`
 * at all rather than `InStock`, because nothing in the data backs that claim —
 * `isDiscontinued === false` means "not marked discontinued", not "confirmed on
 * sale", and an app can be pulled from the store without the row being updated.
 * Same reasoning as `applicationCategory` above: omit rather than assert wrong.
 */
function availabilityFor(isDiscontinued: boolean): Record<string, string> {
	return isDiscontinued
		? { availability: "https://schema.org/Discontinued" }
		: {}
}
