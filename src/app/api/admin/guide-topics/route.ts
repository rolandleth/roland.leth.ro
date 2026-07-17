import { NextResponse } from "next/server"
import { parseJsonBody, respondInternalError } from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { guideTopicCreateSchema } from "@/lib/api/schemas"
import { isPrismaUniqueConstraint, prisma } from "@/lib/db/db"
import { revalidateGuideTopic } from "@/lib/db/guides"
import {
	describeTopicRefProblem,
	findSlugOwner,
} from "@/lib/db/guideValidation"

const TAG = "[api:admin:guide-topics:POST]"

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = await parseJsonBody(request, guideTopicCreateSchema, TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { slug, title, shortDescription, description, published } = parsed
	const projectSlug = parsed.projectSlug ?? null

	try {
		const owner = await findSlugOwner(slug)

		if (owner != null) {
			// eslint-disable-next-line no-console
			console.warn(`${TAG} slug already exists`, { slug, owner })

			return NextResponse.json(
				{ error: `A ${owner} with this slug already exists` },
				{ status: 409 }
			)
		}

		const refProblem = await describeTopicRefProblem({ projectSlug })

		if (refProblem != null) {
			// eslint-disable-next-line no-console
			console.warn(`${TAG} invalid references`, { slug })

			return NextResponse.json({ error: refProblem }, { status: 400 })
		}

		const topic = await prisma.guideTopic.create({
			data: {
				slug,
				title,
				shortDescription,
				description,
				projectSlug,
				published: published ?? true,
			},
		})

		// A brand-new topic has no guides, so there are no parent links to bust.
		revalidateGuideTopic(topic.slug)

		auditLog(TAG, {
			id: topic.id,
			slug: topic.slug,
			section: null,
			sortOrder: null,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		return NextResponse.json(topic, { status: 201 })
	} catch (error) {
		if (isPrismaUniqueConstraint(error)) {
			// eslint-disable-next-line no-console
			console.warn(`${TAG} slug already exists (constraint)`, { slug })

			return NextResponse.json(
				{ error: "A topic with this slug already exists" },
				{ status: 409 }
			)
		}

		return respondInternalError(TAG, error)
	}
}
