import { createElement } from "react"
import { renderToString } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { EMPTY_PRODUCT_PAGE_FIELDS, textSectionFields } from "@/test/fixtures"
import ProductPage from "./ProductPage"
import type { ProjectDetail } from "@/lib/db/projects"

// A `.ts` test, so it runs in the node environment: no `document`, as in Next's
// server render. (The happy-dom tests have one, which sends the lightbox down
// its client-only portal path.)

vi.mock("next/image", async () => {
	const { createElement: create } = await import("react")

	return {
		default: (props: { alt: string; src: string }) =>
			create("img", { alt: props.alt, src: props.src }),
	}
})

function section(
	id: number,
	title: string,
	images: ProjectDetail["sections"][number]["images"] = []
): ProjectDetail["sections"][number] {
	return {
		id,
		projectId: 1,
		title,
		description: `Body of ${title}.`,
		sortOrder: id,
		...textSectionFields(),
		images,
	}
}

const project: ProjectDetail = {
	id: 1,
	name: "Digest",
	slug: "digest",
	summary: "Digest is a food and symptom journal.",
	metaTitle: null,
	keywords: [],
	offers: [{ name: "Once", price: "3.99", priceCurrency: "USD" }],
	applicationCategory: null,
	icon: null,
	cardImage: null,
	ogImage: null,
	heroImage: null,
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
	role: null,
	accentColor: null,
	isFeatured: false,
	isDiscontinued: false,
	isOwnApp: true,
	...EMPTY_PRODUCT_PAGE_FIELDS,
	date: null,
	sortOrder: 0,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [
		section(1, "Guessing cuts too much", [
			{
				id: 11,
				sectionId: 1,
				url: "/11.png",
				caption: null,
				alt: "A guess.",
				sortOrder: 0,
			},
		]),
		section(2, "How it works"),
		section(3, "What Digest doesn't do"),
	],
	links: [],
	faqs: [
		{
			id: 1,
			projectId: 1,
			question: "What is Digest?",
			answer: "A journal.",
			sortOrder: 0,
		},
	],
}

describe("ProductPage — server HTML", () => {
	// The point of the layout: a crawler that doesn't run scripts reads every
	// section, not only the one a tab had open, and the prices as text.
	const html = renderToString(
		createElement(ProductPage, {
			project,
			renderedDescriptions: project.sections.map((s) =>
				createElement("p", { key: s.id }, s.description)
			),
			renderedFaqAnswers: project.faqs.map((faq) =>
				createElement("p", { key: faq.id }, faq.answer)
			),
			guides: [],
		})
	)

	// React escapes apostrophes in text.
	const escaped = (text: string) => text.replace(/'/g, "&#x27;")

	it("holds every section's heading, anchor and text", () => {
		for (const { title, description } of project.sections) {
			expect(html).toContain(`${escaped(title)}</h2>`)
			expect(html).toContain(`<p>${escaped(description)}</p>`)
		}

		expect(html).toContain('id="guessing-cuts-too-much"')
		expect(html).toContain('id="what-digest-doesnt-do"')
	})

	it("holds the price and the FAQ answers as text", () => {
		expect(html).toContain("$3.99")
		expect(html).toContain("<p>A journal.</p>")
	})

	it("holds the screenshots' alt text", () => {
		expect(html).toContain('alt="A guess."')
	})
})
