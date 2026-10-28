import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectPageLayout,
	ProjectProminence,
	ProjectSectionKind,
	ProjectSectionLayout,
	ProjectStatus,
} from "@/generated/prisma/enums"
import {
	CREAM_PALETTE,
	EMPTY_PRODUCT_PAGE_FIELDS,
	GREEN_BAND_THEME,
	textSectionFields,
} from "@/test/fixtures"
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
				className={props.className as string | undefined}
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
		prominence: ProjectProminence.high,
		pageLayout: ProjectPageLayout.product,
		status: ProjectStatus.live,
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

	// The hero makes the claim, so the limit sits on the same screen, under
	// the summary, and isn't repeated at the foot of the page.
	it("shows the disclaimer in the hero, under the summary, and only there", () => {
		renderPage(makeProject({ disclaimer: "Digest is not a medical device." }))

		const hero = screen
			.getByRole("heading", { level: 1 })
			.closest("section") as HTMLElement
		const summary = within(hero).getByText(
			"Digest is a food and symptom journal."
		)
		const disclaimer = within(hero).getByText("Digest is not a medical device.")

		expect(
			summary.compareDocumentPosition(disclaimer) &
				Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
		expect(screen.getAllByText("Digest is not a medical device.")).toHaveLength(
			1
		)
	})

	it("leaves no empty paragraph in the hero without a disclaimer", () => {
		renderPage(makeProject({ disclaimer: null }))

		const hero = screen
			.getByRole("heading", { level: 1 })
			.closest("section") as HTMLElement
		const summary = within(hero).getByText(
			"Digest is a food and symptom journal."
		)

		// The store row follows the summary, where the disclaimer would be.
		expect(summary.nextElementSibling?.tagName).not.toBe("P")
		for (const paragraph of hero.querySelectorAll("p")) {
			expect(paragraph.textContent.trim()).not.toBe("")
		}
	})

	it("shows no status pill for a live app", () => {
		renderPage(makeProject())

		expect(screen.queryByText("Coming soon")).not.toBeInTheDocument()
		expect(screen.queryByText("Discontinued")).not.toBeInTheDocument()
	})

	// The store link stays, on a bare-label pill under the content: a button
	// would offer a download the pill says isn't there yet.
	it("says a coming-soon app is coming soon, with no store button or store note in the hero or the closing", () => {
		renderPage(
			makeProject({
				status: ProjectStatus.comingSoon,
				storeNote: "Logging is free, forever.",
			})
		)

		const hero = screen
			.getByRole("heading", { level: 1 })
			.closest("section") as HTMLElement
		const closing = document.getElementById("get") as HTMLElement

		expect(within(hero).getAllByText("Coming soon")).toHaveLength(1)
		expect(within(closing).getAllByText("Coming soon")).toHaveLength(1)
		expect(
			screen.queryByRole("link", { name: "Download on the App Store" })
		).not.toBeInTheDocument()
		expect(within(hero).queryByRole("link")).not.toBeInTheDocument()
		expect(within(closing).queryByRole("link")).not.toBeInTheDocument()
		expect(
			screen.queryByText("Logging is free, forever.")
		).not.toBeInTheDocument()
		expect(screen.getByRole("link", { name: "App Store" })).toHaveAttribute(
			"href",
			"https://apps.apple.com/app/id123"
		)
	})

	// No link of any kind and no steps section: the status is all that keeps
	// the hero's row and the closing's.
	it("says a coming-soon app with no links is coming soon, in the hero and the closing", () => {
		renderPage(makeProject({ status: ProjectStatus.comingSoon, links: [] }))

		const hero = screen
			.getByRole("heading", { level: 1 })
			.closest("section") as HTMLElement
		const closing = document.getElementById("get") as HTMLElement

		for (const band of [hero, closing]) {
			expect(within(band).getByText("Coming soon")).toHaveClass(
				"product-status-cta-large"
			)
			expect(within(band).queryByRole("link")).not.toBeInTheDocument()
		}
	})

	// The reader looking for the download button finds why there isn't one, so
	// the status sits where the button would: after the summary, before "See how
	// it works", not under the name; and again in the closing.
	it.each([
		[ProjectStatus.comingSoon, "Coming soon"],
		[ProjectStatus.discontinued, "Discontinued"],
	])(
		"puts a %s app's status where the store button would be, in the hero and the closing",
		(status, label) => {
			renderPage(
				makeProject({
					status,
					sections: [
						makeStepsSection(1, "How it works", [makeStep(1, "Log a meal")]),
					],
				})
			)

			const hero = screen
				.getByRole("heading", { level: 1 })
				.closest("section") as HTMLElement
			const closing = document.getElementById("get") as HTMLElement
			const summary = within(hero).getByText(
				"Digest is a food and symptom journal."
			)
			const heroStatus = within(hero).getByText(label)
			const stepsLink = within(hero).getByRole("link", {
				name: "See how it works",
			})

			expect(
				summary.compareDocumentPosition(heroStatus) &
					Node.DOCUMENT_POSITION_FOLLOWING
			).toBeTruthy()
			expect(
				heroStatus.compareDocumentPosition(stepsLink) &
					Node.DOCUMENT_POSITION_FOLLOWING
			).toBeTruthy()
			expect(within(closing).getAllByText(label)).toHaveLength(1)
		}
	)

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
				status: ProjectStatus.discontinued,
				plans,
				offers,
				sections: [makeSection(1, "Free and paid", PRICING_SECTION)],
			})
		)

		expect(screen.queryByText("$6.99")).not.toBeInTheDocument()
		expect(
			screen.queryByRole("link", { name: "Download on the App Store" })
		).not.toBeInTheDocument()
		// The hero and the closing; the pricing section, and its slot, are gone.
		expect(screen.getAllByText("Discontinued")).toHaveLength(2)
	})

	// What it will cost helps a reader decide whether to wait; only the store
	// buttons wait for the launch, and the status says so in their place.
	it("shows a coming-soon app's prices, with its status in place of the store button", () => {
		renderPage(
			makeProject({
				status: ProjectStatus.comingSoon,
				plans,
				offers,
				sections: [makeSection(1, "Free and paid", PRICING_SECTION)],
			})
		)

		const section = screen
			.getByRole("heading", { level: 2, name: "Free and paid" })
			.closest("section") as HTMLElement
		const price = within(section).getByText("$6.99")
		const status = within(section).getByText("Coming soon")

		expect(
			price.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
		expect(within(section).queryByRole("link")).not.toBeInTheDocument()
		expect(railEntries().map((link) => link.textContent)).toEqual([
			"Free and paid",
		])
	})

	it("leaves a discontinued app's pricing section off the page and the rail", () => {
		// With nothing to price it would be a heading over a note.
		renderPage(
			makeProject({
				status: ProjectStatus.discontinued,
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

	// A yearly price beside the monthly and the one-time one. Only a price with a
	// saving to show can be highlighted (`refineHighlightedOffer`), so this is
	// the one the tests flag.
	const yearly = {
		name: "Insights, yearly",
		plan: "Insights",
		price: "41.94",
		priceCurrency: "USD",
		billingPeriod: "P1Y",
		note: "14-day free trial",
	}

	it("puts the highlighted price in its tile, and every other price in every card in the same tile, unmarked", () => {
		renderPage(
			makeProject({
				plans,
				offers: [offers[0], offers[1], { ...yearly, isHighlighted: true }],
			})
		)

		const prices = ["$0", "$6.99", "$41.94"].map(
			(price) => screen.getByText(price).closest("li") as HTMLElement
		)

		expect(prices[2]).toHaveClass(
			"product-plan__price",
			"product-plan__price--highlighted"
		)
		// The free card's price and the monthly one get the same tile, unmarked,
		// so all three sit level.
		for (const price of prices.slice(0, 2)) {
			expect(price).toHaveClass("product-plan__price")
			expect(price).not.toHaveClass("product-plan__price--highlighted")
		}
	})

	// "Best value" was an unqualified superlative, and false: a yearly plan
	// costs as much as the lifetime one after a few years. The saving against
	// the monthly price is the claim the page can stand behind.
	it("says only how much the highlighted price saves against the monthly one, and never calls it the best value", () => {
		renderPage(
			makeProject({
				plans,
				offers: [
					offers[0],
					offers[1],
					{ ...yearly, isHighlighted: true },
					offers[2],
				],
			})
		)

		// 41.94 against 12 × 6.99 = 83.88 is exactly half.
		expect(
			screen.getByText("$41.94").closest("li") as HTMLElement
		).toHaveTextContent(/^\$41\.94a yearSave 50%14-day free trial$/)
		// The one-time price has no per-month cost to compare, and no line.
		expect(screen.getAllByText(/^Save/)).toHaveLength(1)
		expect(document.body).not.toHaveTextContent(/best value/i)
	})

	it("adds no tiles and no saving when no price is highlighted", () => {
		renderPage(makeProject({ plans, offers: [...offers, yearly] }))

		expect(screen.getByText("$6.99").closest("li")).not.toHaveClass(
			"product-plan__price"
		)
		// The yearly price would save 50%, but the line belongs to the highlight.
		expect(screen.queryByText(/^Save/)).not.toBeInTheDocument()
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

	it("leaves the US-prices note out when the plans' prices are in another currency", () => {
		renderPage(
			makeProject({
				plans,
				offers: offers.map((offer) => ({ ...offer, priceCurrency: "EUR" })),
			})
		)

		const pricing = screen
			.getByRole("heading", { level: 2, name: "Pricing" })
			.closest("section") as HTMLElement

		expect(within(pricing).getByText(/6\.99/)).toBeInTheDocument()
		expect(within(pricing).queryByText(/US prices/)).not.toBeInTheDocument()
	})

	// An app on the App Store and the Mac App Store gets a button for each
	// listing here, as in the hero and the closing. Both are the generic App
	// Store badge: with two store links, `linkCtasFor` can't tell which is which.
	it("puts every store button after the plans, not only the first", () => {
		const macLink = {
			id: 2,
			projectId: 1,
			label: "Mac App Store",
			url: "https://apps.apple.com/app/id456",
			sortOrder: 2,
		}
		const project = makeProject({ plans, offers })

		renderPage({ ...project, links: [...project.links, macLink] })

		const pricing = screen
			.getByRole("heading", { level: 2, name: "Pricing" })
			.closest("section") as HTMLElement
		const badgeLinks = (scope: HTMLElement) =>
			within(scope)
				.getAllByRole("link", { name: "Download on the App Store" })
				.map((link) => link.getAttribute("href"))
		const hero = screen
			.getByRole("heading", { level: 1 })
			.closest("section") as HTMLElement
		const closing = document.getElementById("get") as HTMLElement

		expect(badgeLinks(pricing)).toEqual([
			"https://apps.apple.com/app/id123",
			"https://apps.apple.com/app/id456",
		])
		expect(badgeLinks(hero)).toEqual(badgeLinks(pricing))
		expect(badgeLinks(closing)).toEqual(badgeLinks(pricing))
		expect(
			within(pricing).getByText("US prices. The App Store shows yours.")
		).toBeInTheDocument()
	})

	// The status takes the store buttons' place here too: after the cards and
	// the note, at the end of the block.
	it("puts a coming-soon app's status after the automatic Pricing block's note", () => {
		renderPage(makeProject({ status: ProjectStatus.comingSoon, plans, offers }))

		const pricing = screen
			.getByRole("heading", { level: 2, name: "Pricing" })
			.closest("section") as HTMLElement
		const price = within(pricing).getByText("$6.99")
		const note = within(pricing).getByText("US prices.")
		const status = within(pricing).getByText("Coming soon")

		expect(
			price.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
		expect(
			note.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy()
		expect(status).toHaveClass("product-status-cta-large")
		expect(within(pricing).queryByRole("link")).not.toBeInTheDocument()
	})

	// Cards with no price in them, under "Pricing" and a note about US prices,
	// would price nothing.
	it.each([
		["no offers", null],
		["an empty offer list", []],
	])("gives plans with %s no Pricing block", (_label, noOffers) => {
		renderPage(
			makeProject({
				plans,
				offers: noOffers,
				sections: [makeSection(1, "Overview")],
			})
		)

		expect(
			screen.queryByRole("heading", { level: 2, name: "Pricing" })
		).not.toBeInTheDocument()
		expect(
			screen.queryByRole("heading", { level: 3, name: "Insights" })
		).not.toBeInTheDocument()
		expect(screen.queryByText(/US prices/)).not.toBeInTheDocument()
		expect(railEntries().map((link) => link.textContent)).toEqual(["Overview"])
	})

	it("shows a plan with no price of its own as a card with its features, beside the priced ones", () => {
		renderPage(makeProject({ plans, offers: offers.slice(1) }))

		const free = screen
			.getByRole("heading", { level: 3, name: "Free, forever" })
			.closest(".product-plan") as HTMLElement
		const insights = screen
			.getByRole("heading", { level: 3, name: "Insights" })
			.closest(".product-plan") as HTMLElement

		expect(within(free).getByText("Meals.")).toBeInTheDocument()
		expect(within(free).queryByText(/^\$/)).not.toBeInTheDocument()
		expect(within(insights).getByText("$6.99")).toBeInTheDocument()
		expect(within(insights).getByText("$89.99")).toBeInTheDocument()
	})

	// The schema doesn't make offer names unique.
	it("shows two offers with the same name, each with its price", () => {
		renderPage(
			makeProject({
				plans,
				offers: [
					offers[0],
					{ ...offers[1], name: "Insights" },
					{ ...offers[2], name: "Insights" },
				],
			})
		)

		const insights = screen
			.getByRole("heading", { level: 3, name: "Insights" })
			.closest(".product-plan") as HTMLElement
		const logged = vi
			.mocked(console.error)
			.mock.calls.flat()
			.map(String)
			.join("\n")

		expect(within(insights).getByText("$6.99")).toBeInTheDocument()
		expect(within(insights).getByText("$89.99")).toBeInTheDocument()
		expect(logged).not.toMatch(/same key/)
	})

	// No store button means no listing to show the reader's own prices yet.
	it.each([
		["a coming-soon app", { status: ProjectStatus.comingSoon }],
		["an app with no store link", { links: [] }],
	])(
		"leaves the App Store out of the note for %s",
		(_label, overrides: Partial<ProjectDetail>) => {
			renderPage(makeProject({ plans, offers, ...overrides }))

			const pricing = screen
				.getByRole("heading", { level: 2, name: "Pricing" })
				.closest("section") as HTMLElement
			const note = within(pricing).getByText(/^US prices\./)

			expect(note).toHaveTextContent(/^US prices\.$/)
			expect(within(pricing).queryByText(/App Store/)).not.toBeInTheDocument()
		}
	)
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

	it("ends with the links that aren't store links, without a date or a credit", () => {
		renderPage(
			makeProject({
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

		expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute(
			"href",
			"https://roland.leth.ro/privacy/digest"
		)
		expect(screen.queryByText(/updated/i)).not.toBeInTheDocument()
		expect(screen.queryByText(/made by/i)).not.toBeInTheDocument()
	})

	// The disclaimer sits in the hero now, so it no longer opens a last row of
	// its own under the closing.
	it("ends on the closing with a disclaimer but no guides and no other links", () => {
		const disclaimer = "Digest is not a medical device."
		const lastBlock = (container: HTMLElement) =>
			container.querySelector(".product-page")?.lastElementChild

		const { container, unmount } = renderPage(makeProject({ disclaimer }))

		expect(lastBlock(container)).toHaveAttribute("id", "get")
		unmount()

		// The same page with a privacy link does get the row.
		const project = makeProject({ disclaimer })
		const withPrivacy = renderPage({
			...project,
			links: [
				...project.links,
				{
					id: 2,
					projectId: 1,
					label: "Privacy",
					url: "https://roland.leth.ro/privacy/digest",
					sortOrder: 2,
				},
			],
		})

		expect(lastBlock(withPrivacy.container)).toHaveClass("product-frame")
		expect(lastBlock(withPrivacy.container)).not.toHaveTextContent(disclaimer)
	})
})

// #endregion

// #region Store buttons

describe("ProductPage — store buttons", () => {
	it("draws every store badge at the large size: the hero, the pricing and the closing", () => {
		renderPage(
			makeProject({
				plans,
				offers,
				sections: [makeSection(1, "Free and paid", PRICING_SECTION)],
			})
		)

		const badges = screen.getAllByRole("link", {
			name: "Download on the App Store",
		})

		expect(badges).toHaveLength(3)
		for (const badge of badges) {
			// The light and the dark artwork.
			const images = badge.querySelectorAll("img")

			expect(images).toHaveLength(2)
			for (const image of images) {
				expect(image).toHaveClass("h-14")
				expect(image).not.toHaveClass("h-10")
			}
		}
	})

	// The status takes the badge's place, so it takes its size too.
	it("draws a coming-soon app's status at the large badge's size, wherever it stands", () => {
		renderPage(
			makeProject({
				status: ProjectStatus.comingSoon,
				plans,
				offers,
				sections: [makeSection(1, "Free and paid", PRICING_SECTION)],
			})
		)

		const statuses = screen.getAllByText("Coming soon")

		expect(statuses).toHaveLength(3)
		for (const status of statuses) {
			expect(status).toHaveClass("product-status-cta-large")
		}
	})
})

// #endregion

// #region Theme

describe("ProductPage — theme style", () => {
	it("writes the accent, and both themes' palette when the project has one", () => {
		const theme = GREEN_BAND_THEME
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
		const { container } = renderPage(makeProject({ palette: CREAM_PALETTE }))
		const css = [...container.querySelectorAll("style")]
			.map((style) => style.textContent)
			.join("")

		expect(css).toContain(
			"[data-site-header]{--color-header-bg:#f3ede4;--color-primary-value:#2a241e;--color-secondary-value:#6b6158;--color-accent-value:#9a532b;--color-accent:#9a532b;"
		)
		expect(css).toContain(
			".dark [data-site-header]{--color-header-bg:#2a211b;--color-primary-value:#f3ede4;--color-secondary-value:#c9bbae;--color-accent-value:#e0a27a;--color-accent:#e0a27a;"
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
