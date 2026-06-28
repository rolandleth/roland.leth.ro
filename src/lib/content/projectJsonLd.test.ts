import { describe, expect, it } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	buildFaqJsonLd,
	buildSoftwareApplicationJsonLd,
} from "@/lib/content/projectJsonLd"
import type { ProjectDetail } from "@/lib/db/projects"

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
	return {
		id: 1,
		name: "Continuum",
		slug: "continuum",
		summary: "A private Mac app for managers.",
		metaTitle: null,
		keywords: [],
		offers: null,
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
			buildSoftwareApplicationJsonLd(
				makeProject({ bucket: PlatformBucket.Web }),
				null
			)
		).toBeNull()
		expect(
			buildSoftwareApplicationJsonLd(
				makeProject({ bucket: PlatformBucket.OpenSource }),
				null
			)
		).toBeNull()
	})

	it("emits macOS operatingSystem for the Mac bucket", () => {
		const result = buildSoftwareApplicationJsonLd(
			makeProject({ bucket: PlatformBucket.Mac }),
			null
		)

		expect(result).toMatchObject({
			"@type": "SoftwareApplication",
			name: "Continuum",
			operatingSystem: "macOS",
			url: "https://roland.leth.ro/projects/continuum",
			author: { "@type": "Person", name: "Roland Leth" },
		})
	})

	it("emits iOS operatingSystem for the iOS bucket", () => {
		const result = buildSoftwareApplicationJsonLd(
			makeProject({
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.iOS],
			}),
			null
		)
		expect(result).toMatchObject({ operatingSystem: "iOS" })
	})

	it("omits image when null and includes it when provided", () => {
		expect(
			buildSoftwareApplicationJsonLd(makeProject(), null)
		).not.toHaveProperty("image")
		expect(
			buildSoftwareApplicationJsonLd(makeProject(), "https://blob/og.png")
		).toMatchObject({ image: "https://blob/og.png" })
	})

	it("builds an AggregateOffer preserving the original price strings", () => {
		const result = buildSoftwareApplicationJsonLd(
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
		expect(
			buildSoftwareApplicationJsonLd(makeProject({ offers: null }), null)
		).not.toHaveProperty("offers")
	})
})

// #endregion
