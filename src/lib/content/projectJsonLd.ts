// Pure builders for the project detail page's schema.org JSON-LD. Kept I/O-free
// and separate from the page so the shapes are unit-testable and the page stays
// a thin server component. Consumed by `src/app/projects/[slug]/page.tsx`.

import type { ProjectDetail } from "@/lib/db/projects"

// Canonical production origin for absolute URLs in structured data. Hardcoded
// (not derived via `siteBase()`/`headers()`) so the project pages stay
// statically generated — reading request headers here would opt the route into
// dynamic rendering. JSON-LD always points at the canonical host regardless of
// which preview/proxy domain served the request.
const SITE_ORIGIN = "https://roland.leth.ro"

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
 * the resolved OG asset (absolute Blob URL); omitted when null.
 */
export function buildSoftwareApplicationJsonLd(
	project: ProjectDetail,
	image: string | null
): Record<string, unknown> | null {
	if (!APP_BUCKETS.has(project.bucket)) {
		return null
	}

	const { name, summary, bucket, offers, slug } = project

	const jsonLd: Record<string, unknown> = {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name,
		description: summary,
		// simplified: hardcoded category, accurate for the current app projects
		// (Continuum/Reckon are business tools). Ceiling: a non-business app would
		// be mislabeled. Upgrade path: add an optional `appCategory` project field
		// and read it here instead of assuming from bucket.
		applicationCategory: "BusinessApplication",
		operatingSystem: bucket === "iOS" ? "iOS" : "macOS",
		url: `${SITE_ORIGIN}/projects/${slug}`,
		author: { "@type": "Person", name: "Roland Leth" },
	}

	if (image !== null) {
		jsonLd.image = image
	}

	if (offers !== null && offers.length > 0) {
		// Use the original price strings (not a Number round-trip) so "12.00"
		// stays "12.00" rather than collapsing to "12" in the markup.
		const sorted = [...offers].sort((a, b) => Number(a.price) - Number(b.price))

		jsonLd.offers = {
			"@type": "AggregateOffer",
			priceCurrency: offers[0].priceCurrency,
			lowPrice: sorted[0].price,
			highPrice: sorted[sorted.length - 1].price,
			offerCount: offers.length,
		}
	}

	return jsonLd
}
