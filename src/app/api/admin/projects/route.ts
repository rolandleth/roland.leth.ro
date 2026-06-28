import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { parseJsonBody, respondInternalError } from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { projectCreateSchema } from "@/lib/api/schemas"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db/db"
import {
	projectInclude,
	revalidateProject,
	toFaqCreate,
	toLinkCreate,
	toSectionCreate,
} from "@/lib/db/projects"
import { createSlug } from "@/lib/utils/format"

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = await parseJsonBody(
		request,
		projectCreateSchema,
		"[api:admin:projects:POST]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const {
		name,
		summary,
		bucket,
		platformTags,
		role,
		accentColor,
		icon,
		cardImage,
		ogImage,
		heroImage,
		isFeatured,
		isDiscontinued,
		date,
		sortOrder,
		sections,
		links,
		faqs,
	} = parsed

	try {
		// Serializable isolation for the same reason as the PUT handler: a concurrent
		// writer could pick the same `targetOrder` (via `count()` or an overlapping
		// shift) and produce duplicate sortOrder values.
		const project = await prisma.$transaction(
			async (tx) => {
				let targetOrder: number

				const count = await tx.project.count()

				if (sortOrder != null) {
					// Clamp into [0, count] so a value past the end (e.g. count=3,
					// sortOrder=10) doesn't leave gaps `[3..9]` between the existing
					// rows and the newly inserted one — `updateMany({ gte: 10 })`
					// would match nothing and the new project would land at slot 10.
					targetOrder = Math.min(sortOrder, count)
					// Shift everything at or after the target position down to make room.
					await tx.project.updateMany({
						where: { sortOrder: { gte: targetOrder } },
						data: { sortOrder: { increment: 1 } },
					})
				} else {
					// No position given — append at the end. `sortOrder` is 0-indexed
					// everywhere else (reorder helper, DELETE reindex), so `count` is
					// the next free slot, not `count + 1`.
					targetOrder = count
				}

				return tx.project.create({
					data: {
						name,
						slug: createSlug(name),
						summary,
						bucket,
						platformTags,
						role: role ?? null,
						accentColor: accentColor ?? null,
						icon: icon ?? null,
						cardImage: cardImage ?? null,
						ogImage: ogImage ?? null,
						heroImage: heroImage ?? null,
						isFeatured: isFeatured ?? false,
						isDiscontinued: isDiscontinued ?? false,
						date: date ?? null,
						sortOrder: targetOrder,
						sections: toSectionCreate(sections),
						links: toLinkCreate(links),
						faqs: toFaqCreate(faqs),
					},
					include: projectInclude,
				})
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		revalidateProject(project.slug)
		// Audit trail. Vercel Hobby retains runtime logs ~1h, but the structured
		// payload makes it greppable while it's live and is the only signal that
		// answers "did someone create a project at 3am" until external aggregation lands.
		auditLog("[api:admin:projects:POST]", {
			id: project.id,
			slug: project.slug,
			section: null,
			sortOrder: project.sortOrder,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		return NextResponse.json(project, { status: 201 })
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			// Surfaces a flapping admin form submitting the same draft twice, or
			// an attempt to publish two names that slug-collide. Without this,
			// the 409 path is invisible in logs.
			// eslint-disable-next-line no-console
			console.warn("[api:admin:projects:POST] slug already exists", {
				slug: createSlug(name),
			})

			return NextResponse.json(
				{ error: "A project with this slug already exists" },
				{ status: 409 }
			)
		}

		return respondInternalError("[api:admin:projects:POST]", error)
	}
}
