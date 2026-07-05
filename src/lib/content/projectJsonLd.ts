// Pure builders for the project detail page's schema.org JSON-LD. Kept I/O-free
// and separate from the page so the shapes are unit-testable and the page stays
// a thin server component. Consumed by `src/app/projects/[slug]/page.tsx`.

import { absoluteImageUrl, personFor } from "@/lib/content/jsonLd"
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
 * would otherwise emit an invalid relative URL); omitted when null. `base` is
 * the site origin from `siteBase()`, passed in so the builder stays pure.
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

	if (image !== null) {
		jsonLd.image = absoluteImageUrl(image, base)
	}

	const offerNode = buildOfferNode(offers)

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
 */
function buildOfferNode(
	offers: ProjectOffer[] | null
): Record<string, unknown> | Record<string, unknown>[] | null {
	if (offers === null || offers.length === 0) {
		return null
	}

	if (offers.length === 1) {
		return toOfferNode(offers[0])
	}

	// Multi-offer fallback: when currencies differ, schema.org accepts `offers`
	// as an array of `Offer` nodes. Use that shape rather than asserting one
	// currency across the AggregateOffer's lowPrice/highPrice bounds.
	const currencies = new Set(offers.map((offer) => offer.priceCurrency))

	if (currencies.size > 1) {
		return offers.map(toOfferNode)
	}

	// AggregateOffer asserts numeric lowPrice/highPrice bounds. If any price isn't
	// a finite, non-empty number — a future `"free"` sentinel, a locale-formatted
	// `"1,99"` (`NaN`), or an empty/whitespace string (`Number("")` is `0`, not
	// `NaN`, and would emit an empty `lowPrice`) — the sort and the preserved
	// string bounds come out silently wrong. Fall back to the array-of-Offers
	// shape, which makes no range claim, rather than emit a corrupt range.
	const hasNonNumericPrice = offers.some((offer) => {
		const trimmed = offer.price.trim()

		return trimmed === "" || !Number.isFinite(Number(trimmed))
	})

	if (hasNonNumericPrice) {
		return offers.map(toOfferNode)
	}

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

	return {
		"@type": "AggregateOffer",
		priceCurrency: sorted[0].priceCurrency,
		lowPrice: sorted[0].price,
		highPrice: sorted[sorted.length - 1].price,
		offerCount,
	}
}

/** Maps a single price point to a schema.org `Offer` node. */
function toOfferNode(offer: ProjectOffer): Record<string, unknown> {
	return {
		"@type": "Offer",
		price: offer.price,
		priceCurrency: offer.priceCurrency,
	}
}
