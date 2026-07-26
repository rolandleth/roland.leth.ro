import { NextResponse } from "next/server"
import { parseJsonBody, respondInternalError } from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { requireAdmin } from "@/lib/api/requireAdmin"
import { guideCreateSchema } from "@/lib/api/schemas"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db/db"
import { resolvePublishedAt } from "@/lib/db/guideMappers"
import { revalidateTopicsById } from "@/lib/db/guideRevalidation"
import { revalidateGuide } from "@/lib/db/guides"
import {
	describeGuideRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"
import { calculateReadingTime } from "@/lib/utils/format"

const TAG = "[api:admin:guides:POST]"

export async function POST(request: Request): Promise<NextResponse> {
	const unauthorized = await requireAdmin(TAG)

	if (unauthorized) {
		return unauthorized
	}

	const parsed = await parseJsonBody(request, guideCreateSchema, TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { slug, title, description, body, sortOrder, published } = parsed
	const projectSlug = parsed.projectSlug ?? null
	const topicId = parsed.topicId ?? null

	try {
		// Cross-table slug check: the DB's per-table `@@unique` can't see that a
		// topic already owns this URL.
		const owner = await findSlugOwner(slug)

		if (owner != null) {
			// eslint-disable-next-line no-console
			console.warn(`${TAG} slug already exists`, { slug, owner })

			return NextResponse.json(
				{ error: `A ${owner} with this slug already exists` },
				{ status: 409 }
			)
		}

		const refProblem = await describeGuideRefProblem({ projectSlug, topicId })

		if (refProblem != null) {
			// eslint-disable-next-line no-console
			console.warn(`${TAG} invalid references`, { slug })

			return NextResponse.json({ error: refProblem }, { status: 400 })
		}

		const isPublished = published ?? true
		const guide = await prisma.guide.create({
			data: {
				slug,
				title,
				description,
				body,
				projectSlug,
				topicId,
				sortOrder: sortOrder ?? 0,
				published: isPublished,
				publishedAt: resolvePublishedAt(null, isPublished, new Date()),
				readingTime: calculateReadingTime(body),
			},
		})

		revalidateGuide(guide.slug)
		// A new guide changes its hub's list, so the hub page has to go too.
		await revalidateTopicsById([topicId])

		auditLog(TAG, {
			id: guide.id,
			slug: guide.slug,
			section: null,
			sortOrder: guide.sortOrder,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		return NextResponse.json(guide, { status: 201 })
	} catch (error) {
		// The `findSlugOwner` check above is racy by construction; the per-table
		// constraint is what actually holds the line, so map it rather than 500.
		if (isPrismaUniqueConstraint(error)) {
			// eslint-disable-next-line no-console
			console.warn(`${TAG} slug already exists (constraint)`, { slug })

			return NextResponse.json(
				{ error: "A guide with this slug already exists" },
				{ status: 409 }
			)
		}

		return respondInternalError(TAG, error)
	}
}
