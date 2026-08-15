import { describe, expect, it } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { defaultOgImage } from "@/lib/content/metadata"
import {
	buildFaqJsonLd,
	buildSoftwareApplicationJsonLd,
} from "@/lib/content/projectJsonLd"
import type { ProjectDetail } from "@/lib/db/projects"

const BASE = "https://roland.leth.ro"

// The page supplies the origin from `getSiteUrl()`; the builder is pure. This
// wrapper injects a fixed `base` so the existing call sites stay two-arg.
function buildApp(project: ProjectDetail, image: string | null) {
	return buildSoftwareApplicationJsonLd(project, image, BASE)
}

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
	return {
		id: 1,
		name: "Continuum",
		slug: "continuum",
		summary: "A private Mac app for managers.",
		metaTitle: null,
		keywords: [],
		offers: null,
		applicationCategory: null,
		icon: null,
		cardImage: null,
		ogImage: null,
		heroImage: null,
		bucket: PlatformBucket.Mac,
		platformTags: [PlatformTag.macOS],
		role: null,
		accentColor: null,
		isFeatured: false,
		isDiscontinued: false,
		date: null,
		sortOrder: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		sections: [],
		links: [],
		faqs: [],
		...overrides,
	}
}

// #region buildFaqJsonLd

describe("buildFaqJsonLd", () => {
	it("returns null when there are no FAQs", () => {
		expect(buildFaqJsonLd([])).toBeNull()
	})

	it("maps each FAQ to a Question/Answer node", () => {
		const result = buildFaqJsonLd([
			{ question: "Is it free?", answer: "No, it's paid." },
		])

		expect(result).toEqual({
			"@context": "https://schema.org",
			"@type": "FAQPage",
			mainEntity: [
				{
					"@type": "Question",
					name: "Is it free?",
					acceptedAnswer: { "@type": "Answer", text: "No, it's paid." },
				},
			],
		})
	})
})

// #endregion

// #region buildSoftwareApplicationJsonLd

describe("buildSoftwareApplicationJsonLd", () => {
	it("returns null for non-app buckets (Web/OpenSource)", () => {
		expect(
			buildApp(makeProject({ bucket: PlatformBucket.Web }), null)
		).toBeNull()
		expect(
			buildApp(makeProject({ bucket: PlatformBucket.OpenSource }), null)
		).toBeNull()
	})

	it("emits macOS operatingSystem for the Mac bucket", () => {
		const result = buildApp(makeProject({ bucket: PlatformBucket.Mac }), null)

		expect(result).toMatchObject({
			"@type": "SoftwareApplication",
			name: "Continuum",
			operatingSystem: "macOS",
			url: "https://roland.leth.ro/projects/continuum",
			author: {
				"@type": "Person",
				name: "Roland Leth",
				url: "https://roland.leth.ro",
			},
		})
	})

	it("emits iOS operatingSystem for the iOS bucket", () => {
		const result = buildApp(
			makeProject({
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.iOS],
			}),
			null
		)
		expect(result).toMatchObject({ operatingSystem: "iOS" })
	})

	// Matches the page's `og:image` fallback, so both surfaces name one asset.
	it("falls back to the site card when null and uses the asset when provided", () => {
		expect(buildApp(makeProject(), null)).toMatchObject({
			image: `${BASE}${defaultOgImage}`,
		})
		expect(buildApp(makeProject(), "https://blob/og.png")).toMatchObject({
			image: "https://blob/og.png",
		})
	})

	it("absolutizes a legacy site-relative image path against base", () => {
		// A relative `/images/…` would be an invalid `image` for Rich Results;
		// the builder prepends the origin. Already-absolute URLs stay untouched.
		expect(buildApp(makeProject(), "/images/og.png")).toMatchObject({
			image: "https://roland.leth.ro/images/og.png",
		})
	})

	it("emits applicationCategory only when the manifest sets it", () => {
		expect(buildApp(makeProject(), null)).not.toHaveProperty(
			"applicationCategory"
		)
		expect(
			buildApp(
				makeProject({ applicationCategory: "BusinessApplication" }),
				null
			)
		).toMatchObject({ applicationCategory: "BusinessApplication" })
	})

	it("emits a single Offer (not AggregateOffer) for one price point — paid upfront", () => {
		const result = buildApp(
			makeProject({
				offers: [{ name: "App Store", price: "4.99", priceCurrency: "USD" }],
			}),
			null
		)

		expect(result?.offers).toEqual({
			"@type": "Offer",
			price: "4.99",
			priceCurrency: "USD",
		})
	})

	it("represents a free app as a single Offer priced 0", () => {
		const result = buildApp(
			makeProject({
				offers: [{ name: "Free", price: "0", priceCurrency: "USD" }],
			}),
			null
		)

		expect(result?.offers).toEqual({
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		})
	})

	it("spans free→paid as an AggregateOffer for a freemium app", () => {
		const result = buildApp(
			makeProject({
				offers: [
					{ name: "Free", price: "0", priceCurrency: "USD" },
					{ name: "Pro", price: "9.99", priceCurrency: "USD" },
				],
			}),
			null
		)

		expect(result?.offers).toMatchObject({
			"@type": "AggregateOffer",
			lowPrice: "0",
			highPrice: "9.99",
			offerCount: 2,
		})
	})

	it("returns an array of Offer nodes for mixed currencies (AggregateOffer can't span multiple currencies)", () => {
		const result = buildApp(
			makeProject({
				offers: [
					{ name: "US", price: "9.99", priceCurrency: "USD" },
					{ name: "EU", price: "10.99", priceCurrency: "EUR" },
				],
			}),
			null
		)

		expect(result?.offers).toEqual([
			{ "@type": "Offer", price: "9.99", priceCurrency: "USD" },
			{ "@type": "Offer", price: "10.99", priceCurrency: "EUR" },
		])
	})

	it("builds an AggregateOffer preserving the original price strings", () => {
		const result = buildApp(
			makeProject({
				offers: [
					{ name: "Monthly", price: "12.00", priceCurrency: "USD" },
					{ name: "Lifetime", price: "249.00", priceCurrency: "USD" },
					{ name: "Yearly", price: "108.00", priceCurrency: "USD" },
				],
			}),
			null
		)

		expect(result?.offers).toEqual({
			"@type": "AggregateOffer",
			priceCurrency: "USD",
			lowPrice: "12.00",
			highPrice: "249.00",
			offerCount: 3,
		})
	})

	// No non-numeric-price cases here: `Number(price)` in the AggregateOffer sort
	// relies on `projectOfferSchema`'s `/^\d+(\.\d{1,2})?$/`, which both write
	// paths enforce, and that regex is tested directly against `"free"`,
	// `"12.345"`, `"$5"`, `"12,00"` and `""` in `src/lib/api/schemas.test.ts`.
	// Re-testing a read-side fallback here would pin behaviour no sanctioned
	// write can produce.

	it("de-dupes offerCount by (price, currency, billing period)", () => {
		// Two identical rows (e.g. a manifest listing the same tier twice) must not
		// inflate the count past the number of distinct offers.
		const result = buildApp(
			makeProject({
				offers: [
					{ name: "Monthly", price: "5.00", priceCurrency: "USD" },
					{ name: "Monthly dup", price: "5.00", priceCurrency: "USD" },
					{ name: "Yearly", price: "50.00", priceCurrency: "USD" },
				],
			}),
			null
		)

		expect(result?.offers).toMatchObject({
			"@type": "AggregateOffer",
			offerCount: 2,
		})
	})

	it("omits offers when the project has none", () => {
		expect(buildApp(makeProject({ offers: null }), null)).not.toHaveProperty(
			"offers"
		)
	})
})

// #endregion

// #region discontinued availability

// `ProjectContent` drops the "Get on …" CTA for a discontinued project because
// it asserts availability the Discontinued badge contradicts. `offers` is the
// same assertion in machine-readable form, aimed at search and answer engines,
// so it carries `schema:Discontinued` rather than an unqualified price.
describe("buildSoftwareApplicationJsonLd — discontinued availability", () => {
	const DISCONTINUED = "https://schema.org/Discontinued"

	it("marks a single Offer discontinued while keeping the price it sold at", () => {
		const result = buildApp(
			makeProject({
				isDiscontinued: true,
				offers: [{ name: "App Store", price: "4.99", priceCurrency: "USD" }],
			}),
			null
		)

		expect(result?.offers).toEqual({
			"@type": "Offer",
			price: "4.99",
			priceCurrency: "USD",
			availability: DISCONTINUED,
		})
	})

	// A same-currency multi-tier set would otherwise take the AggregateOffer
	// shape. It doesn't when discontinued: `AggregateOffer` accepts
	// `availability` (it subclasses `Offer`), but consumers reading only the
	// documented aggregate fields drop it, and that shape emits no per-`Offer`
	// node to carry the marker instead — so the one project that most needs the
	// Discontinued signal would hang it on the node least likely to be read.
	// Losing the price range is the deliberate trade.
	it("drops the aggregate shape so the discontinued marker survives", () => {
		const result = buildApp(
			makeProject({
				isDiscontinued: true,
				offers: [
					{ name: "Free", price: "0", priceCurrency: "USD" },
					{ name: "Pro", price: "9.99", priceCurrency: "USD" },
				],
			}),
			null
		)

		expect(result?.offers).toEqual([
			{
				"@type": "Offer",
				price: "0",
				priceCurrency: "USD",
				availability: DISCONTINUED,
			},
			{
				"@type": "Offer",
				price: "9.99",
				priceCurrency: "USD",
				availability: DISCONTINUED,
			},
		])
	})

	// The same input with the flag off still aggregates, so the branch above is
	// the discontinued case specifically and not a silent loss of the range.
	// `toEqual`, not `toMatchObject`: the aggregate's own fields are the subject
	// here, and a partial match would pass with `priceCurrency` or `offerCount`
	// missing.
	it("still aggregates the same offers when the project is live", () => {
		const result = buildApp(
			makeProject({
				isDiscontinued: false,
				offers: [
					{ name: "Free", price: "0", priceCurrency: "USD" },
					{ name: "Pro", price: "9.99", priceCurrency: "USD" },
				],
			}),
			null
		)

		expect(result?.offers).toEqual({
			"@type": "AggregateOffer",
			priceCurrency: "USD",
			lowPrice: "0",
			highPrice: "9.99",
			offerCount: 2,
		})
	})

	// The multi-currency shape is a plain array, so every node needs the marker —
	// a per-node property can't be set once on a wrapper that doesn't exist.
	it("marks every node discontinued in the mixed-currency array shape", () => {
		const result = buildApp(
			makeProject({
				isDiscontinued: true,
				offers: [
					{ name: "US", price: "9.99", priceCurrency: "USD" },
					{ name: "EU", price: "10.99", priceCurrency: "EUR" },
				],
			}),
			null
		)

		expect(result?.offers).toEqual([
			{
				"@type": "Offer",
				price: "9.99",
				priceCurrency: "USD",
				availability: DISCONTINUED,
			},
			{
				"@type": "Offer",
				price: "10.99",
				priceCurrency: "EUR",
				availability: DISCONTINUED,
			},
		])
	})

	// Deliberately absent rather than `InStock`: `isDiscontinued === false` means
	// "not marked discontinued", not "confirmed on sale". Asserting availability
	// the data can't back is the failure mode this whole change exists to fix.
	//
	// `toEqual` on the whole node rather than `not.toHaveProperty`: the negative
	// idiom is meaningful here because the subject is a single object, but it
	// passes vacuously against an array return, so it would quietly assert
	// nothing if this case were ever copied to a multi-offer shape.
	it("asserts no availability at all for a live project", () => {
		const result = buildApp(
			makeProject({
				isDiscontinued: false,
				offers: [{ name: "App Store", price: "4.99", priceCurrency: "USD" }],
			}),
			null
		)

		expect(result?.offers).toEqual({
			"@type": "Offer",
			price: "4.99",
			priceCurrency: "USD",
		})
	})

	// Both halves of the `offers === null || offers.length === 0` guard. An empty
	// array is what a manifest with an `offers: []` key produces, and it reached
	// the same branch as `null` only by luck of ordering.
	it.each([
		["null offers", null],
		["an empty offers array", []],
	])("emits no offers for a discontinued project with %s", (_label, offers) => {
		expect(
			buildApp(makeProject({ isDiscontinued: true, offers }), null)
		).not.toHaveProperty("offers")
	})
})

// #endregion
