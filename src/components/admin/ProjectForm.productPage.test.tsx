import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	PlatformBucket,
	PlatformTag,
	ProjectPageLayout,
	ProjectProminence,
	ProjectSectionKind,
	ProjectSectionLayout,
} from "@/generated/prisma/enums"
import { setupUser } from "@/test/user"
import ProjectForm from "./ProjectForm"

// The product-page fields and the section fields they bring with them. Kept
// apart from `ProjectForm.test.tsx`, which covers the rest of the form, so the
// section round trip can run against the real `SectionManager`.

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

// The real editor loads the markdown pipeline at import; a textarea is enough.
vi.mock("@/components/admin/MarkdownEditor", () => ({
	default: ({
		value,
		onChange,
	}: {
		value: string
		onChange: (v: string) => void
	}) => <textarea value={value} onChange={(e) => onChange(e.target.value)} />,
}))

vi.mock("@/components/admin/ImageUpload", () => ({
	default: ({ label }: { label?: string }) => <div>{label}</div>,
}))

const user = setupUser()

const initialData = {
	id: 7,
	name: "Digest",
	slug: "digest",
	summary: "A food and symptom journal.",
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
	role: "Sole developer",
	accentColor: null,
	icon: null,
	cardImage: null,
	ogImage: null,
	heroImage: null,
	prominence: ProjectProminence.high,
	pageLayout: ProjectPageLayout.product,
	isDiscontinued: false,
	isOwnApp: true,
	date: "2026",
	sortOrder: 0,
	heroEyebrow: "Food and symptom journal",
	heroHeadline: null,
	sections: [
		{
			id: 2,
			title: "How it works",
			description: "",
			sortOrder: 0,
			kind: ProjectSectionKind.steps,
			layout: null,
			images: [],
			items: [
				{
					title: "Log a meal",
					description: "Type it.",
					sortOrder: 0,
					images: [
						{
							url: "https://example.com/log.png",
							caption: null,
							alt: "The log sheet.",
							sortOrder: 0,
						},
					],
				},
				{
					title: "Then how you feel",
					description: "Log it.",
					sortOrder: 1,
					images: [],
				},
			],
		},
		{
			id: 1,
			title: "Every suspect shows its work",
			description: "Evidence.",
			sortOrder: 1,
			kind: ProjectSectionKind.text,
			layout: ProjectSectionLayout.split,
			items: [],
			images: [
				{
					id: 10,
					url: "https://example.com/a.png",
					caption: "",
					alt: "A long description.",
					sortOrder: 0,
				},
				{
					id: 11,
					url: "https://example.com/b.png",
					caption: "",
					alt: "",
					sortOrder: 1,
				},
			],
		},
	],
	links: [],
	faqs: [],
}

function mockSave() {
	vi.mocked(useRouter).mockReturnValue({
		push: vi.fn(),
		refresh: vi.fn(),
	} as unknown as ReturnType<typeof useRouter>)
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		headers: new Headers({ "content-type": "application/json" }),
		json: () => Promise.resolve({}),
	})
}

async function saveAndReadPayload(): Promise<Record<string, unknown>> {
	await user.click(screen.getByRole("button", { name: /save project/i }))
	await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
	const [, options] = vi.mocked(global.fetch).mock.calls[0]

	return JSON.parse(String(options?.body))
}

beforeEach(() => {
	vi.resetAllMocks()
	mockSave()
})

// #region Product page group

describe("ProjectForm — product page group", () => {
	it("shows the group for the product page layout, prefilled from the stored values", () => {
		render(<ProjectForm initialData={initialData} />)

		expect(screen.getByRole("group", { name: "Product page" })).toBeVisible()
		expect(screen.getByLabelText("Hero eyebrow")).toHaveValue(
			"Food and symptom journal"
		)
		expect(screen.getByLabelText("Hero headline")).toHaveValue("")
	})

	it("hides the group for the portfolio page layout", () => {
		render(
			<ProjectForm
				initialData={{
					...initialData,
					pageLayout: ProjectPageLayout.portfolio,
				}}
			/>
		)

		expect(
			screen.queryByRole("group", { name: "Product page" })
		).not.toBeInTheDocument()
	})

	it("shows the group whoever owns the project: the layout decides alone", () => {
		render(<ProjectForm initialData={{ ...initialData, isOwnApp: false }} />)

		expect(screen.getByRole("group", { name: "Product page" })).toBeVisible()
	})

	it("keeps typed values when the layout switches away and back", async () => {
		render(<ProjectForm initialData={initialData} />)
		await user.type(screen.getByLabelText("Closing headline"), "10 seconds")

		const page = screen.getByLabelText("Page")
		await user.selectOptions(page, ProjectPageLayout.portfolio)
		await user.selectOptions(page, ProjectPageLayout.product)

		expect(screen.getByLabelText("Closing headline")).toHaveValue("10 seconds")
	})

	it("caps each field at the length the API accepts", () => {
		render(<ProjectForm initialData={initialData} />)

		expect(screen.getByLabelText("Hero eyebrow")).toHaveAttribute(
			"maxLength",
			"80"
		)
		expect(screen.getByLabelText("Store button note")).toHaveAttribute(
			"maxLength",
			"120"
		)
		expect(
			screen.getByLabelText("Meta description (defaults to the summary)")
		).toHaveAttribute("maxLength", "160")
	})

	it("sends trimmed values, and null for an empty or whitespace-only field", async () => {
		render(<ProjectForm initialData={initialData} />)
		await user.type(screen.getByLabelText("Hero headline"), "  Find suspects  ")
		await user.type(screen.getByLabelText("Disclaimer"), "   ")

		const payload = await saveAndReadPayload()

		expect(payload.heroEyebrow).toBe("Food and symptom journal")
		expect(payload.heroHeadline).toBe("Find suspects")
		expect(payload.disclaimer).toBeNull()
		expect(payload.storeNote).toBeNull()
	})

	it("never sends plans, palette or offers, which only the import writes", async () => {
		render(<ProjectForm initialData={initialData} />)

		const payload = await saveAndReadPayload()

		expect(payload).not.toHaveProperty("plans")
		expect(payload).not.toHaveProperty("palette")
		expect(payload).not.toHaveProperty("offers")
	})
})

// #endregion

// #region Section round trip

describe("ProjectForm — section fields survive a save", () => {
	// The PUT route replaces every section, so anything the form doesn't send
	// back is deleted on save.
	it("sends each section's kind, layout and steps back", async () => {
		render(<ProjectForm initialData={initialData} />)

		const payload = await saveAndReadPayload()
		const [steps, text] = payload.sections as {
			kind: string
			layout: string | null
			items: unknown[]
		}[]

		expect(steps).toMatchObject({ kind: "steps", layout: null })
		// The form doesn't edit steps; they go back exactly as loaded.
		expect(steps.items).toEqual(initialData.sections[0].items)
		expect(text).toMatchObject({ kind: "text", layout: "split", items: [] })
	})

	it("sends each image's alt text back", async () => {
		render(<ProjectForm initialData={initialData} />)

		const payload = await saveAndReadPayload()
		const [, section] = payload.sections as {
			images: { alt: string | null }[]
		}[]

		expect(section.images.map((image) => image.alt)).toEqual([
			"A long description.",
			// Empty goes out as null: stored as "", it would make the image
			// decorative.
			null,
		])
	})

	it("sends an edited alt text", async () => {
		render(<ProjectForm initialData={initialData} />)
		await user.type(screen.getAllByLabelText("Alt text")[1], "Second shot")

		const payload = await saveAndReadPayload()
		const [, section] = payload.sections as {
			images: { alt: string | null }[]
		}[]

		expect(section.images[1].alt).toBe("Second shot")
	})
})

// #endregion
