import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@/generated/prisma/client"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { prisma } from "@/lib/db/db"
import { EMPTY_PRODUCT_PAGE_FIELDS } from "@/test/fixtures"
import { POST } from "./route"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
	prisma: {
		$transaction: vi.fn(),
		project: {
			create: vi.fn(),
			count: vi.fn(),
			updateMany: vi.fn(),
		},
	},
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
}))

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/admin/projects", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

const validPayload = {
	name: "My App",
	slug: "my-app",
	summary: "An iOS app that does things.",
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
}

const createdProject = {
	id: 1,
	name: "My App",
	slug: "my-app",
	summary: "An iOS app that does things.",
	metaTitle: null,
	keywords: [],
	offers: null,
	applicationCategory: null,
	bucket: PlatformBucket.iOS,
	platformTags: [PlatformTag.iOS],
	role: null,
	accentColor: null,
	icon: null,
	cardImage: null,
	ogImage: null,
	heroImage: null,
	isFeatured: false,
	isDiscontinued: false,
	isOwnApp: false,
	...EMPTY_PRODUCT_PAGE_FIELDS,
	date: null,
	sortOrder: 1,
	createdAt: new Date(),
	updatedAt: new Date(),
	sections: [],
	links: [],
	faqs: [],
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("POST /api/admin/projects", () => {
	function makeTx(updateMany = vi.fn()) {
		return {
			project: {
				create: vi.mocked(prisma.project.create),
				count: vi.mocked(prisma.project.count),
				updateMany,
			},
		} as unknown as Prisma.TransactionClient
	}

	beforeEach(() => {
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx())
		)
		vi.mocked(prisma.project.count).mockResolvedValue(0)
	})

	it("returns 201 with the created project on a valid payload", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(201)

		const data = await response.json()
		expect(data.id).toBe(1)
	})

	it("emits an info-level audit log on successful create", async () => {
		// Without this line, an out-of-band project creation has no trace once
		// the access log rolls over.
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(makeRequest(validPayload))

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:POST] success",
			{
				id: createdProject.id,
				slug: createdProject.slug,
				section: null,
				sortOrder: createdProject.sortOrder,
				previousSection: null,
				previousSlug: null,
				batchId: null,
			}
		)
	})

	it("stores the authored slug as sent, not one derived from the name", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		await POST(
			makeRequest({ ...validPayload, name: "Reckon — Time", slug: "reckon" })
		)

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.slug).toBe("reckon")
	})

	it("returns 400 when the slug is missing", async () => {
		const { slug: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it.each(["My App", "my--app", "-my-app", "my-app-", "my_app", ""])(
		"returns 400 for the non-canonical slug %j instead of rewriting it",
		async (slug) => {
			const response = await POST(makeRequest({ ...validPayload, slug }))
			expect(response.status).toBe(400)
		}
	)

	it("accepts a name that has no letters or digits, since the slug is authored", async () => {
		// The name used to be refined for producing a non-empty slug. With the
		// slug authored, a name like this is just a name.
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		const response = await POST(
			makeRequest({ ...validPayload, name: "計算機", slug: "calculator" })
		)
		expect(response.status).toBe(201)
	})

	it("passes FAQs through to the nested create with defaulted sortOrder", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(
			makeRequest({
				...validPayload,
				faqs: [{ question: "Is it free?", answer: "Yes." }],
			})
		)

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.faqs).toEqual({
			create: [{ question: "Is it free?", answer: "Yes.", sortOrder: 0 }],
		})
	})

	it("stores metaTitle, keywords, and offers when provided", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		const offers = [
			{ name: "Monthly", price: "12.00", priceCurrency: "USD" as const },
		]
		await POST(
			makeRequest({
				...validPayload,
				metaTitle: "Notes for managers (Mac)",
				keywords: ["1:1 notes app"],
				offers,
				applicationCategory: "BusinessApplication",
			})
		)

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.metaTitle).toBe("Notes for managers (Mac)")
		expect(data.keywords).toEqual(["1:1 notes app"])
		expect(data.offers).toEqual(offers)
		expect(data.applicationCategory).toBe("BusinessApplication")
	})

	it("writes SQL NULL for offers and defaults when the SEO fields are omitted", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		// Prisma.DbNull is the sentinel that writes SQL NULL to a Json? column.
		expect(data.offers).toBe(Prisma.DbNull)
		expect(data.metaTitle).toBeNull()
		expect(data.keywords).toEqual([])
		expect(data.applicationCategory).toBeNull()
	})

	it("writes the product-page fields, plans and palette from the payload", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		const plans = [{ name: "Free", features: ["Meals."], sortOrder: 1 }]
		const theme = {
			band: "#24443a",
			bandInk: "#f4f1e8",
			bandInk2: "#c9d3cc",
			bandHighlight: "#cfa75a",
			accentText: "#2e7d5b",
		}

		await POST(
			makeRequest({
				...validPayload,
				heroEyebrow: "Food and symptom journal",
				heroHeadline: "Find which foods to suspect",
				storeNote: "Logging is free, forever.",
				closingHeadline: "10 seconds a meal",
				disclaimer: "Not a medical device.",
				metaDescription: "A food and symptom journal for iPhone.",
				plans,
				palette: { light: theme, dark: theme },
				sections: [
					{
						title: "Every suspect shows its work",
						description: "Evidence.",
						kind: "text",
						layout: "split",
						images: [{ url: "https://example.com/a.png", alt: "Alt." }],
					},
					{
						title: "How it works",
						kind: "steps",
						items: [
							{
								title: "Log a meal",
								description: "Type it.",
								images: [{ url: "https://example.com/log.png", alt: "Log." }],
							},
							{ title: "Then how you feel", description: "Log it." },
						],
					},
				],
			})
		)

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.heroEyebrow).toBe("Food and symptom journal")
		expect(data.heroHeadline).toBe("Find which foods to suspect")
		expect(data.storeNote).toBe("Logging is free, forever.")
		expect(data.closingHeadline).toBe("10 seconds a meal")
		expect(data.disclaimer).toBe("Not a medical device.")
		expect(data.metaDescription).toBe("A food and symptom journal for iPhone.")
		expect(data.plans).toEqual(plans)
		expect(data.palette).toEqual({ light: theme, dark: theme })
		expect(data.sections).toEqual({
			create: [
				expect.objectContaining({
					kind: "text",
					layout: "split",
					images: {
						create: [expect.objectContaining({ alt: "Alt." })],
					},
				}),
				expect.objectContaining({
					kind: "steps",
					layout: null,
					items: {
						create: [
							expect.objectContaining({
								title: "Log a meal",
								images: {
									create: [expect.objectContaining({ alt: "Log." })],
								},
							}),
							expect.objectContaining({ title: "Then how you feel" }),
						],
					},
				}),
			],
		})
	})

	it("writes null product-page fields and SQL NULL plans and palette when they're omitted", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.heroEyebrow).toBeNull()
		expect(data.metaDescription).toBeNull()
		expect(data.plans).toBe(Prisma.DbNull)
		expect(data.palette).toBe(Prisma.DbNull)
	})

	it("writes isFeatured, isDiscontinued and isOwnApp as false when they're omitted", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.isFeatured).toBe(false)
		expect(data.isDiscontinued).toBe(false)
		expect(data.isOwnApp).toBe(false)
	})

	it("stores isFeatured, isDiscontinued and isOwnApp when they're set", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		await POST(
			makeRequest({
				...validPayload,
				isFeatured: true,
				isDiscontinued: true,
				isOwnApp: true,
			})
		)

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.isFeatured).toBe(true)
		expect(data.isDiscontinued).toBe(true)
		expect(data.isOwnApp).toBe(true)
	})

	it("appends after the last project when no sortOrder is provided", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		vi.mocked(prisma.project.count).mockResolvedValue(5)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await POST(makeRequest(validPayload))

		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		// With 5 existing projects at sortOrder 0..4, the new one slots in at 5
		// (0-indexed). `count + 1` would create a gap that the reorder helper
		// and DELETE reindex both assume doesn't exist.
		expect(data.sortOrder).toBe(5)
		expect(updateMany).not.toHaveBeenCalled()
	})

	it("shifts projects at or after the target position when sortOrder is provided", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		// Count=5 so sortOrder=3 is in-range and not clamped.
		vi.mocked(prisma.project.count).mockResolvedValue(5)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await POST(makeRequest({ ...validPayload, sortOrder: 3 }))

		expect(updateMany).toHaveBeenCalledWith({
			where: { sortOrder: { gte: 3 } },
			data: { sortOrder: { increment: 1 } },
		})
		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.sortOrder).toBe(3)
	})

	it("clamps sortOrder to the current count to avoid leaving gaps", async () => {
		// count=3, sortOrder=10: without clamping, the new project would land
		// at slot 10 leaving slots 3..9 empty. Clamp to 3 (the next free slot).
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)
		vi.mocked(prisma.project.count).mockResolvedValue(3)
		const updateMany = vi.fn()
		vi.mocked(prisma.$transaction).mockImplementation(
			async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
				fn(makeTx(updateMany))
		)

		await POST(makeRequest({ ...validPayload, sortOrder: 10 }))

		expect(updateMany).toHaveBeenCalledWith({
			where: { sortOrder: { gte: 3 } },
			data: { sortOrder: { increment: 1 } },
		})
		const { data } = vi.mocked(prisma.project.create).mock.calls[0][0]
		expect(data.sortOrder).toBe(3)
	})

	it("accepts optional sections and links", async () => {
		vi.mocked(prisma.project.create).mockResolvedValue(createdProject)

		const response = await POST(
			makeRequest({
				...validPayload,
				sections: [
					{
						title: "Overview",
						description: "Main overview.",
						kind: "text",
						layout: "stacked",
						images: [{ url: "https://example.com/img.png" }],
					},
				],
				links: [{ label: "App Store", url: "https://apps.apple.com/app" }],
			})
		)
		expect(response.status).toBe(201)
	})

	it("returns 400 when name is missing", async () => {
		const { name: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when summary is missing", async () => {
		const { summary: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when bucket is missing", async () => {
		const { bucket: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when platformTags is missing", async () => {
		const { platformTags: _, ...rest } = validPayload
		const response = await POST(makeRequest(rest))
		expect(response.status).toBe(400)
	})

	it("returns 400 when platformTags is empty", async () => {
		const response = await POST(
			makeRequest({ ...validPayload, platformTags: [] })
		)
		expect(response.status).toBe(400)
	})

	it("returns 400 when a link has a non-http URL", async () => {
		const response = await POST(
			makeRequest({
				...validPayload,
				links: [{ label: "Bad", url: "javascript:evil()" }],
			})
		)
		expect(response.status).toBe(400)
	})

	it("returns 400 when a section image has a non-http URL", async () => {
		const response = await POST(
			makeRequest({
				...validPayload,
				sections: [
					{
						title: "S",
						description: "D",
						kind: "text",
						layout: "stacked",
						// eslint-disable-next-line sonarjs/no-clear-text-protocols
						images: [{ url: "ftp://bad.com/img.png" }],
					},
				],
			})
		)
		expect(response.status).toBe(400)
	})

	it("returns 500 when prisma throws an unexpected error", async () => {
		vi.mocked(prisma.$transaction).mockRejectedValue(new Error("DB failure"))

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(500)
	})

	it("returns 409 when the slug collides with an existing project", async () => {
		vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2002" })
		const { isPrismaUniqueConstraint } = await import("@/lib/db/db")
		vi.mocked(isPrismaUniqueConstraint).mockReturnValue(true)

		const response = await POST(makeRequest(validPayload))
		expect(response.status).toBe(409)
		const data = await response.json()
		expect(data.error).toMatch(/already exists/)
		// 409s are interesting signal (admin form flap, intentional collision);
		// without this log, the path is invisible in production.
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:admin:projects:POST] slug already exists",
			{ slug: "my-app" }
		)
	})

	it("returns 400 when the request body is not valid JSON", async () => {
		const response = await POST(
			new Request("http://localhost/api/admin/projects", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "not-json",
			})
		)
		expect(response.status).toBe(400)
	})
})
