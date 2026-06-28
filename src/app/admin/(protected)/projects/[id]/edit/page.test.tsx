import { beforeEach, describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { prisma } from "@/lib/db/db"
import { projectInclude } from "@/lib/db/projects"
import { generateMetadata, default as EditProjectPage } from "./page"

vi.mock("@/lib/db/db", () => ({
	prisma: {
		project: { findUnique: vi.fn() },
	},
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
}))

vi.mock("@/components/admin/ProjectForm", () => ({
	default: function MockProjectForm() {
		return null
	},
}))

function makeParams(id: string) {
	return { params: Promise.resolve({ id }) }
}

const existingProject = {
	id: 1,
	name: "My App",
	slug: "my-app",
	summary: "A project",
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
	role: null,
	icon: null,
	cardImage: null,
	ogImage: null,
	heroImage: null,
	accentColor: null,
	isFeatured: false,
	isDiscontinued: false,
	date: null,
	sortOrder: 0,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [
		{
			id: 10,
			projectId: 1,
			title: "Overview",
			description: "Some text",
			sortOrder: 0,
			images: [
				{
					id: 100,
					sectionId: 10,
					url: "/img.png",
					caption: null,
					sortOrder: 0,
				},
			],
		},
	],
	links: [],
}

beforeEach(() => {
	vi.resetAllMocks()
})

// ---------------------------------------------------------------------------

describe("generateMetadata", () => {
	it("returns 'Edit project' for a non-numeric id", async () => {
		const result = await generateMetadata(makeParams("abc"))
		expect(result).toEqual({ title: "Edit project" })
	})

	it("returns 'Edit project' when the project does not exist", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
		const result = await generateMetadata(makeParams("99"))
		expect(result).toEqual({ title: "Edit project" })
	})

	it("returns 'Edit: {name}' when the project exists", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		const result = await generateMetadata(makeParams("1"))
		expect(result).toEqual({ title: "Edit: My App" })
	})

	it("queries by id (single fetch shared with the page body via React cache())", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		await generateMetadata(makeParams("1"))
		expect(vi.mocked(prisma.project.findUnique)).toHaveBeenCalledWith({
			where: { id: 1 },
			include: projectInclude,
		})
	})

	it("does not query the db for a non-numeric id", async () => {
		await generateMetadata(makeParams("abc"))
		expect(vi.mocked(prisma.project.findUnique)).not.toHaveBeenCalled()
	})
})

// ---------------------------------------------------------------------------

describe("EditProjectPage", () => {
	it("calls notFound for a non-numeric id", async () => {
		await expect(EditProjectPage(makeParams("abc"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("calls notFound when the project does not exist", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(null)
		await expect(EditProjectPage(makeParams("99"))).rejects.toThrow("NOT_FOUND")
	})

	it("renders ProjectForm with the project data", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		const element = await EditProjectPage(makeParams("1"))
		expect(element.props.initialData).toEqual(
			expect.objectContaining({ id: 1 })
		)
	})

	it("normalizes null image captions to empty strings", async () => {
		vi.mocked(prisma.project.findUnique).mockResolvedValue(existingProject)
		const element = await EditProjectPage(makeParams("1"))
		expect(element.props.initialData.sections[0].images[0].caption).toBe("")
	})

	it("preserves non-null image captions", async () => {
		const project = {
			...existingProject,
			sections: [
				{
					...existingProject.sections[0],
					images: [
						{ ...existingProject.sections[0].images[0], caption: "A caption" },
					],
				},
			],
		}
		vi.mocked(prisma.project.findUnique).mockResolvedValue(project)
		const element = await EditProjectPage(makeParams("1"))
		expect(element.props.initialData.sections[0].images[0].caption).toBe(
			"A caption"
		)
	})
})
