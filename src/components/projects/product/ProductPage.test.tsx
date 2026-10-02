import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectSectionKind,
	ProjectSectionLayout,
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

type Step = Section["items"][number]

function makeStepImage(id: number, alt: string): Step["images"][number] {
	return {
		id,
		itemId: 1,
		url: `/step-${id}.png`,
		caption: null,
		alt,
		sortOrder: 0,
	}
}

function makeStep(
	id: number,
	title: string,
	overrides: Partial<Step> = {}
): Step {
	return {
		id,
		sectionId: 1,
		title,
		description: `Body of step ${title}.`,
		sortOrder: id,
		images: [],
		...overrides,
	}
}

function makeStepsSection(
	id: number,
	title: string,
	steps: Step[],
	overrides: Partial<Section> = {}
): Section {
	return makeSection(id, title, {
		kind: ProjectSectionKind.steps,
		layout: null,
		description: "",
		items: steps,
		...overrides,
	})
}

function renderPage(project: ProjectDetail) {
	return render(
		<ProductPage
			project={project}
			renderedDescriptions={project.sections.map((section) => (
				<p key={section.id}>{section.description}</p>
			))}
			renderedItemDescriptions={project.sections.map((section) =>
				section.items.map((item) => <p key={item.id}>{item.description}</p>)
			)}
			renderedFaqAnswers={project.faqs.map((faq) => (
				<p key={faq.id}>{faq.answer}</p>
			))}
			guides={[]}
		/>
	)
}

/** The desktop rail's section entries, without its "Back to top" link. */
function railEntries(): HTMLElement[] {
	const [rail] = screen.getAllByRole("navigation", { name: "On this page" })

	return within(within(rail).getByRole("list")).getAllByRole("link")
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

	it("links 'See how it works' to the first steps section", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Guessing cuts too much"),
					makeStepsSection(2, "How it works", [
						makeStep(1, "Log a meal"),
						makeStep(2, "Then how you feel"),
					]),
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

	it("puts a stacked section's gallery before its text, and a split section's after it", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Stacked", {
						images: [makeImage(11, "Stacked shot.")],
					}),
					makeSection(2, "Split", {
						layout: ProjectSectionLayout.split,
						images: [makeImage(21, "Split shot.")],
					}),
				],
			})
		)

		function isBefore(first: HTMLElement, second: HTMLElement): boolean {
			return Boolean(
				first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING
			)
		}

		expect(
			isBefore(
				screen.getByAltText("Stacked shot."),
				screen.getByText("Body of Stacked.")
			)
		).toBe(true)
		expect(
			isBefore(
				screen.getByText("Body of Split."),
				screen.getByAltText("Split shot.")
			)
		).toBe(true)
	})

	it("renders a section written before layouts existed as stacked", () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Old", {
						layout: null,
						images: [makeImage(11, "Old shot.")],
					}),
				],
			})
		)

		expect(
			screen
				.getByAltText("Old shot.")
				.compareDocumentPosition(screen.getByText("Body of Old.")) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
	})
})

// #endregion

// #region Steps

describe("ProductPage — steps", () => {
	it("renders the steps as a numbered list, each title read as '1. Title' with its body", () => {
		renderPage(
			makeProject({
				sections: [
					makeStepsSection(1, "How it works", [
						makeStep(1, "Log a meal"),
						makeStep(2, "Then how you feel"),
					]),
				],
			})
		)

		const section = screen
			.getByRole("heading", { level: 2, name: "How it works" })
			.closest("section") as HTMLElement
		const steps = within(within(section).getByRole("list")).getAllByRole(
			"listitem"
		)

		expect(steps).toHaveLength(2)
		expect(
			within(steps[0]).getByRole("heading", { level: 3 }).textContent
		).toBe("1. Log a meal")
		expect(
			within(steps[1]).getByRole("heading", { level: 3 }).textContent
		).toBe("2. Then how you feel")
		expect(
			within(steps[1]).getByText("Body of step Then how you feel.")
		).toBeInTheDocument()
	})

	it("shows the intro above the steps only when there is one", () => {
		const steps = [makeStep(1, "Log a meal"), makeStep(2, "Then how you feel")]
		const { unmount } = renderPage(
			makeProject({
				sections: [
					makeStepsSection(1, "How it works", steps, {
						description: "Three things, every day.",
					}),
				],
			})
		)

		expect(screen.getByText("Three things, every day.")).toBeInTheDocument()
		unmount()

		const { container } = renderPage(
			makeProject({ sections: [makeStepsSection(1, "How it works", steps)] })
		)
		const section = container.querySelector("#how-it-works") as HTMLElement

		// The empty intro renders nothing, not an empty paragraph.
		expect(section.querySelectorAll(".prose")).toHaveLength(2)
	})

	it("gives each step with images its own carousel under its body, and leaves the others without", () => {
		renderPage(
			makeProject({
				sections: [
					makeStepsSection(1, "How it works", [
						makeStep(1, "Log a meal", {
							images: [makeStepImage(1, "The log sheet.")],
						}),
						makeStep(2, "Then how you feel"),
					]),
				],
			})
		)

		const carousel = screen.getByRole("group", {
			name: "Digest: Log a meal screenshots",
		})
		expect(within(carousel).getByAltText("The log sheet.")).toBeInTheDocument()
		expect(
			screen
				.getByText("Body of step Log a meal.")
				.compareDocumentPosition(carousel) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
		expect(
			screen.queryByRole("group", { name: /Then how you feel screenshots/ })
		).not.toBeInTheDocument()
	})

	it("walks section and step images in one lightbox, in page order", async () => {
		renderPage(
			makeProject({
				sections: [
					makeSection(1, "Guessing", { images: [makeImage(5, "Guess shot.")] }),
					makeStepsSection(2, "How it works", [
						// The same id as the section image: they come from two tables.
						makeStep(1, "Log a meal", {
							images: [makeStepImage(5, "The log sheet.")],
						}),
						makeStep(2, "Then how you feel", {
							images: [makeStepImage(6, "The symptom sheet.")],
						}),
					]),
				],
			})
		)

		await user.click(
			screen.getByRole("button", { name: "Enlarge Guess shot." })
		)
		const dialog = screen.getByRole("dialog")
		const next = within(dialog).getByRole("button", { name: /next image/i })

		await user.click(next)
		expect(within(dialog).getByAltText("The log sheet.")).toBeInTheDocument()

		await user.click(next)
		expect(
			within(dialog).getByAltText("The symptom sheet.")
		).toBeInTheDocument()
	})

	it("gives `priority` to a step's image when it's the first on the page", () => {
		renderPage(
			makeProject({
				sections: [
					makeStepsSection(1, "How it works", [
						makeStep(1, "Log a meal", {
							images: [makeStepImage(1, "The log sheet.")],
						}),
						makeStep(2, "Then how you feel", {
							images: [makeStepImage(2, "The symptom sheet.")],
						}),
					]),
				],
			})
		)

		expect(screen.getByAltText("The log sheet.")).toHaveAttribute(
			"data-priority",
			"true"
		)
		expect(screen.getByAltText("The symptom sheet.")).not.toHaveAttribute(
			"data-priority"
		)
	})

	it("lists a steps section in the rail once, not each step", () => {
		renderPage(
			makeProject({
				sections: [
					makeStepsSection(1, "How it works", [
						makeStep(1, "Log a meal"),
						makeStep(2, "Then how you feel"),
					]),
				],
			})
		)

		expect(railEntries().map((link) => link.textContent)).toEqual([
			"How it works",
		])
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

	it("gives a pricing section titled Pricing the plain #pricing, and keeps the automatic block off", () => {
		// With a section of its own the page has no automatic block, so `pricing`
		// isn't taken and the URL doesn't end in `#pricing-2`.
		renderPage(
			makeProject({
				plans,
				offers,
				sections: [makeSection(1, "Pricing", PRICING_SECTION)],
			})
		)

		const headings = screen.getAllByRole("heading", {
			level: 2,
			name: "Pricing",
		})

		expect(headings).toHaveLength(1)
		expect(headings[0].closest("section")).toHaveAttribute("id", "pricing")
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

	it("leaves a discontinued app's pricing section off the page and the rail", () => {
		// With nothing to price it would be a heading over a note.
		renderPage(
			makeProject({
				isDiscontinued: true,
				plans,
				offers,
				sections: [
					makeSection(1, "Overview"),
					makeSection(2, "Free and paid", PRICING_SECTION),
				],
			})
		)

		expect(
			screen.queryByRole("heading", { level: 2, name: "Free and paid" })
		).not.toBeInTheDocument()
		expect(railEntries().map((link) => link.textContent)).toEqual(["Overview"])
	})

	it("prints a pricing section's note after the cards and before the store button", () => {
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
		const cards = within(section).getByRole("heading", {
			level: 3,
			name: "Insights",
		})
		const note = within(section).getByText("Prices are for the US.")
		const button = within(section).getByRole("link", {
			name: "Download on the App Store",
		})

		expect(
			cards.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
		expect(
			note.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
	})

	it("prints an offer's note with its price", () => {
		renderPage(
			makeProject({
				plans,
				offers: [
					offers[0],
					{
						...offers[1],
						name: "Insights, yearly",
						price: "39.99",
						billingPeriod: "P1Y",
						note: "14-day free trial",
					},
				],
			})
		)

		const insights = screen
			.getByRole("heading", { level: 3, name: "Insights" })
			.closest(".product-plan") as HTMLElement
		const price = within(insights).getByText("$39.99").closest("li")

		expect(price).toHaveTextContent("$39.99a year14-day free trial")
	})

	it("puts the best-value price in its tile with the badge, and every other price in every card in the same tile, unmarked", () => {
		renderPage(
			makeProject({
				plans,
				offers: [offers[0], offers[1], { ...offers[2], isBestValue: true }],
			})
		)

		const prices = ["$0", "$6.99", "$89.99"].map(
			(price) => screen.getByText(price).closest("li") as HTMLElement
		)

		expect(prices[2]).toContainElement(screen.getByText("Best value"))
		expect(prices[2]).toHaveTextContent("Best value$89.99once")
		expect(prices[2]).toHaveClass(
			"product-plan__price",
			"product-plan__price--best"
		)
		// The free card's price and the monthly one get the same tile, unmarked,
		// so all three sit level.
		for (const price of prices.slice(0, 2)) {
			expect(price).toHaveClass("product-plan__price")
			expect(price).not.toHaveClass("product-plan__price--best")
		}
		// A one-time price has no per-month cost to compare.
		expect(screen.queryByText(/^Save/)).not.toBeInTheDocument()
	})

	it("says how much the best value saves against the monthly price", () => {
		renderPage(
			makeProject({
				plans,
				offers: [
					offers[0],
					offers[1],
					{
						name: "Insights, yearly",
						plan: "Insights",
						price: "41.94",
						priceCurrency: "USD",
						billingPeriod: "P1Y",
						note: "14-day free trial",
						isBestValue: true,
					},
				],
			})
		)

		// 41.94 against 12 × 6.99 = 83.88 is exactly half.
		expect(
			screen.getByText("$41.94").closest("li") as HTMLElement
		).toHaveTextContent("Best value$41.94a yearSave 50%14-day free trial")
	})

	it("adds no tiles and no badge when no price is the best value", () => {
		renderPage(makeProject({ plans, offers }))

		expect(screen.queryByText("Best value")).not.toBeInTheDocument()
		expect(screen.getByText("$6.99").closest("li")).not.toHaveClass(
			"product-plan__price"
		)
	})

	it("centres the prices in a row of cards, and keeps a lone card's under its name", () => {
		const { unmount } = renderPage(makeProject({ plans, offers }))

		expect(screen.getByText("$6.99").closest("ul")).toHaveClass(
			"justify-center"
		)
		unmount()

		renderPage(
			makeProject({
				plans: [{ name: "Reckon", features: ["Syncs over iCloud."] }],
				offers: [
					{ name: "Once", plan: "Reckon", price: "3.99", priceCurrency: "USD" },
				],
			})
		)

		expect(screen.getByText("$3.99").closest("ul")).not.toHaveClass(
			"justify-center"
		)
	})

	it("puts everything for a single upfront price in one card", () => {
		renderPage(
			makeProject({
				plans: [{ name: "Reckon", features: ["Syncs over iCloud."] }],
				offers: [
					{
						name: "One-time purchase",
						plan: "Reckon",
						price: "3.99",
						priceCurrency: "USD",
					},
				],
			})
		)

		const cards = document.querySelectorAll(".product-plan")

		expect(cards).toHaveLength(1)
		expect(cards[0]).toHaveTextContent("$3.99")
		expect(cards[0]).toHaveTextContent("once")
		expect(cards[0]).toHaveTextContent("Syncs over iCloud.")
	})

	it("notes US prices under the automatic Pricing block's plan cards", () => {
		renderPage(makeProject({ plans, offers }))

		const pricing = screen
			.getByRole("heading", { level: 2, name: "Pricing" })
			.closest("section") as HTMLElement

		expect(
			within(pricing).getByText("US prices. The App Store shows yours.")
		).toBeInTheDocument()
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

		const hrefs = railEntries().map((link) => link.getAttribute("href"))

		expect(hrefs).toHaveLength(14)
		expect(hrefs.slice(-2)).toEqual(["#pricing", "#faq"])
	})

	it("ends the rail with a way back to the top that clears the section from the URL", async () => {
		// The root layout's `<main>`, which the page renders inside.
		const main = document.createElement("main")
		main.id = "main-content"
		main.tabIndex = -1
		document.body.append(main)
		const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {})
		window.history.replaceState(null, "", "/projects/digest?ref=x#faq")

		try {
			renderPage(makeProject({ sections: twelveSections }))

			const [rail] = screen.getAllByRole("navigation", {
				name: "On this page",
			})
			const link = within(rail).getByRole("link", { name: "Back to top" })

			// Without JavaScript, the skip link's target.
			expect(link).toHaveAttribute("href", "#main-content")

			await user.click(link)

			expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
			expect(window.location.hash).toBe("")
			expect(window.location.pathname).toBe("/projects/digest")
			expect(window.location.search).toBe("?ref=x")
			expect(main).toHaveFocus()
		} finally {
			scrollTo.mockRestore()
			main.remove()
			window.history.replaceState(null, "", "/")
		}
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

		const hrefs = railEntries().map((link) => link.getAttribute("href"))

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

	it("opens and closes an answer with its question, keeping a closed one out of reach", async () => {
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
				],
			})
		)

		const button = screen.getByRole("button", { name: "What is Digest?" })
		const panel = document.getElementById(
			button.getAttribute("aria-controls") ?? ""
		)

		expect(button.closest("h3")).not.toBeNull()
		expect(button).toHaveAttribute("aria-expanded", "false")
		expect(panel).toHaveAttribute("inert")
		expect(panel).toHaveTextContent("A journal.")

		await user.click(button)
		expect(button).toHaveAttribute("aria-expanded", "true")
		expect(panel).not.toHaveAttribute("inert")

		await user.click(button)
		expect(button).toHaveAttribute("aria-expanded", "false")
		expect(panel).toHaveAttribute("inert")
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
