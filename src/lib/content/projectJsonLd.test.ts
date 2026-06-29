import { describe, expect, it } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	buildFaqJsonLd,
	buildSoftwareApplicationJsonLd,
	safeJsonLdString,
} from "@/lib/content/projectJsonLd"
import type { ProjectDetail } from "@/lib/db/projects"

const BASE = "https://roland.leth.ro"

// The page supplies the origin from `siteBase()`; the builder is pure. This
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

	it("omits image when null and includes it when provided", () => {
		expect(buildApp(makeProject(), null)).not.toHaveProperty("image")
		expect(buildApp(makeProject(), "https://blob/og.png")).toMatchObject({
			image: "https://blob/og.png",
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

	it("omits offers when the project has none", () => {
		expect(buildApp(makeProject({ offers: null }), null)).not.toHaveProperty(
			"offers"
		)
	})
})

// #endregion

// #region safeJsonLdString

describe("safeJsonLdString", () => {
	it("escapes `<`, `>`, and `&` so values can't close the script tag or inject HTML", () => {
		const result = safeJsonLdString({
			"@context": "https://schema.org",
			"@type": "Question",
			name: "What about </script><img src=x onerror=alert(1)>?",
			text: "A & B",
		})

		expect(result).not.toContain("<")
		expect(result).not.toContain(">")
		expect(result).not.toContain("&")
		expect(result).toContain("\\u003c/script\\u003e")
		expect(result).toContain("\\u0026")
	})

	it("escapes U+2028 / U+2029 so the embedded JSON stays parseable", () => {
		const u2028 = String.fromCharCode(0x2028)
		const u2029 = String.fromCharCode(0x2029)
		const result = safeJsonLdString({ text: `line${u2028}break${u2029}para` })

		expect(result).not.toContain(u2028)
		expect(result).not.toContain(u2029)
		expect(result).toContain("\\u2028")
		expect(result).toContain("\\u2029")
	})

	it("round-trips back to the original value via JSON.parse", () => {
		const value = {
			question: "Is 1 < 2 & 2 > 1?",
			answer: "Yes",
		}

		expect(JSON.parse(safeJsonLdString(value))).toEqual(value)
	})
})

// #endregion
