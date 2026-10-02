import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectSectionKind,
} from "@/generated/prisma/enums"
import { EMPTY_PRODUCT_PAGE_FIELDS, textSectionFields } from "@/test/fixtures"
import { setupUser } from "@/test/user"
import ProductPage from "./ProductPage"
import type { ProjectDetail } from "@/lib/db/projects"

const user = setupUser()

vi.mock("next/image", () => ({
	default: (props: Record<string, unknown>) => {
		return (
			// eslint-disable-next-line @next/next/no-img-element
			<img
				alt={props.alt as string}
				src={props.src as string}
				data-priority={props.priority === true ? "true" : undefined}
			/>
		)
	},
}))

type Section = ProjectDetail["sections"][number]
type SectionImage = Section["images"][number]

/** The overrides that turn `makeSection` into the section the plans go in. */
const PRICING_SECTION: Partial<Section> = {
	kind: ProjectSectionKind.pricing,
	layout: null,
}

function makeImage(id: number, alt: string): SectionImage {
	return {
		id,
		sectionId: 1,
		url: `/${id}.png`,
		caption: null,
		alt,
		sortOrder: 0,
	}
}

function makeSection(
	id: number,
	title: string,
	overrides: Partial<Section> = {}
): Section {
	return {
		id,
		projectId: 1,
		title,
		description: `Body of ${title}.`,
		sortOrder: id,
		...textSectionFields(),
		images: [],
		...overrides,
	}
}

function makeProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
	return {
		id: 1,
		name: "Digest",
		slug: "digest",
		summary: "Digest is a food and symptom journal.",
		metaTitle: null,
		keywords: [],
		offers: null,
		applicationCategory: null,
		icon: null,
		cardImage: null,
		ogImage: null,
		heroImage: null,
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
		role: null,
		accentColor: "#405A55",
		isFeatured: false,
		isDiscontinued: false,
		isOwnApp: true,
		...EMPTY_PRODUCT_PAGE_FIELDS,
		date: null,
		sortOrder: 0,
		createdAt: new Date(),
		updatedAt: new Date(),
		sections: [],
		links: [
			{
				id: 1,
				projectId: 1,
				label: "App Store",
				url: "https://apps.apple.com/app/id123",
				sortOrder: 1,
			},
		],
		faqs: [],
		...overrides,
	}
}

function renderPage(project: ProjectDetail) {
	return render(
		<ProductPage
			project={project}
			renderedDescriptions={project.sections.map((section) => (
				<p key={section.id}>{section.description}</p>
			))}
			renderedFaqAnswers={project.faqs.map((faq) => (
				<p key={faq.id}>{faq.answer}</p>
			))}
			guides={[]}
		/>
	)
}

const twelveSections = Array.from({ length: 12 }, (_, index) =>
	makeSection(index + 1, `Section ${index + 1}`)
)

const plans = [
	{ name: "Free, forever", features: ["Meals."], sortOrder: 1 },
	{
		name: "Insights",
		isHighlighted: true,
		features: ["Suspects.", "The weekly letter."],
		sortOrder: 2,
	},
]

const offers = [
	{ name: "Free", plan: "Free, forever", price: "0", priceCurrency: "USD" },
	{
		name: "Insights, monthly",
		plan: "Insights",
		price: "6.99",
		priceCurrency: "USD",
		billingPeriod: "P1M",
	},
	{
		name: "Insights, once",
		plan: "Insights",
		price: "89.99",
		priceCurrency: "USD",
	},
]

// #region Hero

describe("ProductPage — hero", () => {
	it("puts the name, eyebrow and headline in one h1, joined for text extraction", () => {
		renderPage(
			makeProject({
				heroEyebrow: "Food and symptom journal for iPhone and iPad",
				heroHeadline: "Find which foods to suspect",
			})
		)

		const headings = screen.getAllByRole("heading", { level: 1 })
		expect(headings).toHaveLength(1)
		expect(headings[0]).toHaveTextContent(
			"Digest: Food and symptom journal for iPhone and iPad. Find which foods to suspect"
		)
	})

	it("joins the name and a headline with no eyebrow by a colon", () => {
		renderPage(makeProject({ heroHeadline: "Find which foods to suspect" }))

		expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
			"Digest: Find which foods to suspect"
		)
	})

	it("renders a bare-name h1 when there's no hero line", () => {
		renderPage(makeProject())

		expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Digest")
	})

	it("shows the store button and the store note", () => {
		renderPage(makeProject({ storeNote: "Logging is free, forever." }))

		const hero = screen.getByRole("heading", { level: 1 }).closest("section")
		expect(hero).not.toBeNull()
		expect(
			within(hero as HTMLElement).getByRole("link", {
				name: "Download on the App Store",
			})
		).toHaveAttribute("href", "https://apps.apple.com/app/id123")
		expect(
			within(hero as HTMLElement).getByText("Logging is free, forever.")
		).toBeInTheDocument()
	})

	it("links 'See how it works' to the section with numbered steps", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Guessing cuts too much"),
					makeSection(2, "How it works", {
						description: "### 1. Log a meal\n\nBody.",
					}),
				],
			})
		)

		expect(
			screen.getByRole("link", { name: "See how it works" })
		).toHaveAttribute("href", "#how-it-works")
	})

	it("leaves 'See how it works' out when no section has steps", () => {
		renderPage(makeProject({ sections: [makeSection(1, "How it works")] }))

		expect(
			screen.queryByRole("link", { name: "See how it works" })
		).not.toBeInTheDocument()
	})
})

// #endregion

// #region Sections

describe("ProductPage — sections", () => {
	it("renders every section at once, each with its own h2 and anchor", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Guessing cuts too much"),
					makeSection(2, "When it isn't the food"),
					makeSection(3, "Each week, and on one page"),
				],
			})
		)

		for (const [title, id] of [
			["Guessing cuts too much", "guessing-cuts-too-much"],
			["When it isn't the food", "when-it-isnt-the-food"],
			["Each week, and on one page", "each-week-and-on-one-page"],
		]) {
			const heading = screen.getByRole("heading", { level: 2, name: title })
			expect(heading.closest("section")).toHaveAttribute("id", id)
		}

		expect(screen.getByText("Body of Guessing cuts too much.")).toBeVisible()
		expect(
			screen.getByText("Body of Each week, and on one page.")
		).toBeVisible()
		expect(screen.queryByRole("tablist")).not.toBeInTheDocument()
	})

	it("gives two sections with the same title different anchors", () => {
		renderPage(
			makeProject({
				sections: [makeSection(1, "Overview"), makeSection(2, "Overview")],
			})
		)

		const ids = screen
			.getAllByRole("heading", { level: 2, name: "Overview" })
			.map((heading) => heading.closest("section")?.id)
		expect(ids).toEqual(["overview", "overview-2"])
	})

	it("gives a section with images a carousel and an image-less one none", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "With pictures", {
						images: [makeImage(11, "A screenshot.")],
					}),
					makeSection(2, "Text only"),
				],
			})
		)

		expect(
			screen.getByRole("group", { name: "Digest: With pictures screenshots" })
		).toBeInTheDocument()
		expect(
			screen.queryByRole("group", { name: /Text only screenshots/ })
		).not.toBeInTheDocument()
	})

	it("gives `priority` to the first screenshot when there's no hero image", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "One", { images: [makeImage(11, "First shot.")] }),
					makeSection(2, "Two", { images: [makeImage(21, "Second shot.")] }),
				],
			})
		)

		expect(screen.getByAltText("First shot.")).toHaveAttribute(
			"data-priority",
			"true"
		)
		expect(screen.getByAltText("Second shot.")).not.toHaveAttribute(
			"data-priority"
		)
	})

	it("gives `priority` to the hero image alone when there is one", () => {
		renderPage(
			makeProject({
				heroImage: "/hero.png",
				heroImageAlt: "Four cards from Digest.",
				sections: [
					makeSection(1, "One", { images: [makeImage(11, "First shot.")] }),
				],
			})
		)

		expect(screen.getByAltText("Four cards from Digest.")).toHaveAttribute(
			"data-priority",
			"true"
		)
		expect(screen.getByAltText("First shot.")).not.toHaveAttribute(
			"data-priority"
		)
	})

	it.each([
		["card", { cardImage: "/card.png", ogImage: "/og.png" }, "/card.png"],
		["OG", { cardImage: null, ogImage: "/og.png" }, "/og.png"],
	])(
		"falls back to the %s image beside the hero, and gives it `priority`",
		(_label, images, expected) => {
			renderPage(
				makeProject({
					...images,
					sections: [
						makeSection(1, "One", { images: [makeImage(11, "First shot.")] }),
					],
				})
			)
			const heroImage = screen.getByAltText("Digest screenshot")

			expect(heroImage).toHaveAttribute("src", expected)
			expect(heroImage).toHaveAttribute("data-priority", "true")
			expect(screen.getByAltText("First shot.")).not.toHaveAttribute(
				"data-priority"
			)
		}
	)

	it("walks every section's images in one lightbox and leaves the carousel on the last one viewed", async () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Alpha", {
						images: [makeImage(11, "Alpha one"), makeImage(12, "Alpha two")],
					}),
					makeSection(2, "Beta", { images: [makeImage(21, "Beta one")] }),
				],
			})
		)

		await user.click(screen.getByRole("button", { name: "Enlarge Alpha one" }))
		const dialog = screen.getByRole("dialog")
		const next = within(dialog).getByRole("button", { name: /next image/i })

		await user.click(next)
		await user.click(next)
		expect(within(dialog).getByAltText("Beta one")).toBeInTheDocument()

		// Paging moved Alpha's carousel along to its second image.
		const alpha = screen.getByRole("group", {
			name: "Digest: Alpha screenshots",
		})
		expect(
			within(alpha).getByRole("button", { name: "Go to image 2" })
		).toHaveAttribute("aria-current", "true")
	})
})

// #endregion

// #region Pricing

describe("ProductPage — pricing", () => {
	it("renders the plan cards inside the section that holds them, with prices and labels", () => {
		renderPage(
			makeProject({
				plans,
				offers,
				sections: [
					makeSection(1, "Free and paid", {
						...PRICING_SECTION,
						description: "Prices are for the US.",
					}),
				],
			})
		)

		const section = screen
			.getByRole("heading", { level: 2, name: "Free and paid" })
			.closest("section") as HTMLElement
		const free = within(section)
			.getByRole("heading", { level: 3, name: "Free, forever" })
			.closest(".product-plan") as HTMLElement
		const insights = within(section)
			.getByRole("heading", { level: 3, name: "Insights" })
			.closest(".product-plan") as HTMLElement

		expect(within(free).getByText("$0")).toBeInTheDocument()
		expect(within(insights).getByText("$6.99")).toBeInTheDocument()
		expect(within(insights).getByText("a month")).toBeInTheDocument()
		expect(within(insights).getByText("$89.99")).toBeInTheDocument()
		expect(within(insights).getByText("once")).toBeInTheDocument()
		expect(insights).toHaveClass("product-plan--highlighted")
		expect(free).not.toHaveClass("product-plan--highlighted")
		// A store button after the plans, where the reader decides.
		expect(
			within(section).getByRole("link", { name: "Download on the App Store" })
		).toBeInTheDocument()
		expect(
			screen.queryByRole("heading", { level: 2, name: "Pricing" })
		).not.toBeInTheDocument()
	})

	it("gives the plans a Pricing section before the FAQ when no section holds them", () => {
		renderPage(
			makeProject({
				plans,
				offers,
				sections: [makeSection(1, "Overview")],
				faqs: [
					{ id: 1, projectId: 1, question: "Q?", answer: "A.", sortOrder: 0 },
				],
			})
		)

		const pricing = screen.getByRole("heading", { level: 2, name: "Pricing" })
		const faq = screen.getByRole("heading", { level: 2, name: "FAQ" })

		expect(pricing.closest("section")).toHaveAttribute("id", "pricing")
		expect(
			pricing.compareDocumentPosition(faq) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
	})

	it("lists the offers by name when the project has offers but no plans", () => {
		renderPage(
			makeProject({
				offers: [
					{ name: "One-time purchase", price: "3.99", priceCurrency: "USD" },
				],
			})
		)

		const pricing = screen
			.getByRole("heading", { level: 2, name: "Pricing" })
			.closest("section") as HTMLElement
		expect(within(pricing).getByText("$3.99")).toBeInTheDocument()
		expect(within(pricing).getByText("One-time purchase")).toBeInTheDocument()
		expect(
			within(pricing).getByText("US prices. The App Store shows yours.")
		).toBeInTheDocument()
	})

	it("shows no prices and no store buttons for a discontinued app", () => {
		renderPage(
			makeProject({
				isDiscontinued: true,
				plans,
				offers,
				sections: [makeSection(1, "Free and paid", PRICING_SECTION)],
			})
		)

		expect(screen.queryByText("$6.99")).not.toBeInTheDocument()
		expect(
			screen.queryByRole("link", { name: "Download on the App Store" })
		).not.toBeInTheDocument()
		expect(screen.getByText("Discontinued")).toBeInTheDocument()
	})
})

// #endregion

// #region Section list

describe("ProductPage — section list", () => {
	it("lists every section, the pricing and the FAQ", () => {
		renderPage(
			makeProject({
				sections: twelveSections,
				offers: [{ name: "Once", price: "3.99", priceCurrency: "USD" }],
				faqs: [
					{ id: 1, projectId: 1, question: "Q?", answer: "A.", sortOrder: 0 },
				],
			})
		)

		const [rail] = screen.getAllByRole("navigation", { name: "On this page" })
		const hrefs = within(rail)
			.getAllByRole("link")
			.map((link) => link.getAttribute("href"))

		expect(hrefs).toHaveLength(14)
		expect(hrefs.slice(-2)).toEqual(["#pricing", "#faq"])
	})

	it("adds a collapsed list for narrow screens", () => {
		renderPage(makeProject({ sections: twelveSections }))

		expect(
			screen.getByText("On this page", { selector: "summary" })
		).toBeInTheDocument()
	})

	it("shows the section list on a short page too", () => {
		renderPage(
			makeProject({
				sections: twelveSections.slice(0, 1),
				faqs: [
					{ id: 1, projectId: 1, question: "Q?", answer: "A.", sortOrder: 0 },
				],
			})
		)

		const [rail] = screen.getAllByRole("navigation", { name: "On this page" })
		const hrefs = within(rail)
			.getAllByRole("link")
			.map((link) => link.getAttribute("href"))

		expect(hrefs).toHaveLength(2)
		expect(hrefs.at(-1)).toBe("#faq")
		expect(
			screen.getByText("On this page", { selector: "summary" })
		).toBeInTheDocument()
	})
})

// #endregion

// #region FAQ, closing, meta

describe("ProductPage — FAQ, closing and the last row", () => {
	it("keeps every FAQ answer in the page, open or not", () => {
		renderPage(
			makeProject({
				faqs: [
					{
						id: 1,
						projectId: 1,
						question: "What is Digest?",
						answer: "A journal.",
						sortOrder: 0,
					},
					{
						id: 2,
						projectId: 1,
						question: "Where is my data?",
						answer: "On your device.",
						sortOrder: 1,
					},
				],
			})
		)

		expect(
			screen.getByRole("heading", { level: 3, name: "What is Digest?" })
		).toBeInTheDocument()
		expect(screen.getByText("On your device.")).toBeInTheDocument()
	})

	it("closes with the closing headline, the name above it, and the store button", () => {
		renderPage(
			makeProject({
				closingHeadline: "10 seconds a meal",
				closingBody: "Three weeks of this is the cheap way to find out.",
			})
		)

		const closing = screen
			.getByRole("heading", { level: 2, name: "10 seconds a meal" })
			.closest("section") as HTMLElement
		expect(within(closing).getByText("Digest")).toBeInTheDocument()
		expect(
			within(closing).getByText(
				"Three weeks of this is the cheap way to find out."
			)
		).toBeInTheDocument()
		expect(
			within(closing).getByRole("link", { name: "Download on the App Store" })
		).toBeInTheDocument()
	})

	it("uses the name as the closing heading when there's no closing headline", () => {
		renderPage(makeProject())

		expect(
			screen.getByRole("heading", { level: 2, name: "Digest" })
		).toBeInTheDocument()
	})

	it("ends with the disclaimer and the links that aren't store links, without a date or a credit", () => {
		renderPage(
			makeProject({
				disclaimer: "Digest is not a medical device.",
				links: [
					{
						id: 1,
						projectId: 1,
						label: "App Store",
						url: "https://apps.apple.com/app/id123",
						sortOrder: 1,
					},
					{
						id: 2,
						projectId: 1,
						label: "Privacy",
						url: "https://roland.leth.ro/privacy/digest",
						sortOrder: 2,
					},
				],
			})
		)

		expect(
			screen.getByText("Digest is not a medical device.")
		).toBeInTheDocument()
		expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
			"href",
			"https://roland.leth.ro/privacy/digest"
		)
		expect(screen.queryByText(/updated/i)).not.toBeInTheDocument()
		expect(screen.queryByText(/made by/i)).not.toBeInTheDocument()
	})
})

// #endregion

// #region Theme

describe("ProductPage — theme style", () => {
	it("writes the accent, and both themes' palette when the project has one", () => {
		const theme = {
			band: "#24443a",
			bandInk: "#f4f1e8",
			bandInk2: "#c9d3cc",
			bandHighlight: "#cfa75a",
			accentText: "#2e7d5b",
		}
		const { container } = renderPage(
			makeProject({
				palette: { light: theme, dark: { ...theme, band: "#1b3329" } },
			})
		)
		const css = [...container.querySelectorAll("style")]
			.map((style) => style.textContent)
			.join("")

		expect(css).toContain("--project-accent:#405A55")
		expect(css).toContain(
			".product-page{--project-accent:#405A55;--product-band:#24443a"
		)
		expect(css).toContain(".dark .product-page{--product-band:#1b3329")
	})

	it("gives the site header each theme's band colour and inks", () => {
		const light = {
			band: "#f3ede4",
			bandInk: "#2a241e",
			bandInk2: "#6b6158",
			bandHighlight: "#9a532b",
			accentText: "#9a532b",
		}
		const dark = {
			band: "#2a211b",
			bandInk: "#f3ede4",
			bandInk2: "#c9bbae",
			bandHighlight: "#e0a27a",
			accentText: "#e0a27a",
		}
		const { container } = renderPage(makeProject({ palette: { light, dark } }))
		const css = [...container.querySelectorAll("style")]
			.map((style) => style.textContent)
			.join("")

		expect(css).toContain(
			"[data-site-header]{--color-header-bg:#f3ede4;--color-primary-value:#2a241e;--color-secondary-value:#6b6158;--color-accent:#9a532b;"
		)
		expect(css).toContain(
			".dark [data-site-header]{--color-header-bg:#2a211b;--color-primary-value:#f3ede4;--color-secondary-value:#c9bbae;--color-accent:#e0a27a;"
		)
	})

	it("writes only the accent without a palette, and tints the header with it", () => {
		const { container } = renderPage(makeProject())
		const css = [...container.querySelectorAll("style")]
			.map((style) => style.textContent)
			.join("")

		expect(css).toContain(".product-page{--project-accent:#405A55}")
		expect(css).toContain(
			"[data-site-header]{--color-header-bg:color-mix(in srgb,#405A55 9%,var(--color-background-value))}"
		)
		expect(css).not.toContain("--product-band")
		expect(css).not.toContain("--color-primary-value")
	})

	it("tints the header with the site accent when the project has no accent", () => {
		const { container } = renderPage(makeProject({ accentColor: null }))
		const css = [...container.querySelectorAll("style")]
			.map((style) => style.textContent)
			.join("")

		expect(css).toContain(
			".product-page{--project-accent:var(--color-accent-value)}"
		)
		expect(css).toContain(
			"color-mix(in srgb,var(--color-accent-value) 9%,var(--color-background-value))"
		)
	})
})

// #endregion
