import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import {
	handlePrismaError,
	parseIdParam,
	parseJsonBody,
	respondInternalError,
} from "@/lib/api/apiErrors"
import { auditLog } from "@/lib/api/auditLog"
import { postUpdateSchema } from "@/lib/api/schemas"
import { deriveSummary } from "@/lib/content/markdown"
import { prisma } from "@/lib/db/db"
import { revalidatePostSection } from "@/lib/db/posts"
import { calculateReadingTime, createSlug } from "@/lib/utils/format"

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		const post = await prisma.post.findUnique({ where: { id } })

		if (!post) {
			return NextResponse.json({ error: "Not found" }, { status: 404 })
		}

		return NextResponse.json(post)
	} catch (error) {
		return respondInternalError("[api:admin:posts:GET]", error)
	}
}

export async function PUT(
	request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	const parsed = await parseJsonBody(
		request,
		postUpdateSchema,
		"[api:admin:posts:PUT]"
	)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { title, body: postBody, summary, ...rest } = parsed
	// Prisma treats `undefined` as "skip this column" and `null` as "set null",
	// so the validated payload flows straight in. `title`/`body`/`summary` are
	// folded back with their derived columns (`slug`, `readingTime`, auto-derived
	// summary) only when they were set or when the rules below require a re-derive.
	// Matches the shape in `src/app/api/admin/projects/[id]/route.ts`.
	type PostUpdatePayload = typeof rest & {
		title?: string
		slug?: string
		body?: string
		summary?: string
		readingTime?: string
	}
	const data: PostUpdatePayload = { ...rest }

	if (title != null) {
		data.title = title
		data.slug = createSlug(title)
	}

	if (postBody != null) {
		data.body = postBody
		data.readingTime = calculateReadingTime(postBody)
	}

	try {
		// Serializable isolation matches the project PUT. Two concurrent
		// cross-section moves at READ COMMITTED could both observe the same
		// `previous.section` and miss one side's cache invalidation. The race
		// is benign (stale cache for one revalidate window, not corruption),
		// but Serializable closes it cheaply at single-admin volumes where
		// `serialization_failure` is essentially impossible. Under conflict
		// the route surfaces a generic 500 — same shape as the project PUT.
		// No retry loop: Prisma does NOT auto-retry serialization failures,
		// and re-running the txn from the client would need idempotency
		// guards on `auditLog` (must not double-fire) before that's safe.
		// The 500 is therefore NOT client-retriable — admin must re-issue
		// the PUT manually if it ever surfaces in practice.
		const { previous, post } = await prisma.$transaction(
			async (tx) => {
				// `body` + `summary` are read inside the txn so the summary
				// resolution below sees the same row state as the write.
				const previous = await tx.post.findUnique({
					where: { id },
					select: { section: true, slug: true, body: true, summary: true },
				})

				// Summary resolution. Two effective inputs after the write:
				//   - `effectiveBody`  = new body if sent, else previous body.
				//   - `summary` arrives as a non-empty string (user authored
				//     something in the form) OR `undefined` (form cleared the
				//     field, since `state.summary || undefined` strips empties).
				// Rules:
				//   - User authored a fresh summary (differs from previous) → keep it.
				//   - User left the summary untouched (equals previous) AND the
				//     body changed → re-derive so the meta description tracks
				//     the new body. Without this, an edited post keeps a stale
				//     summary forever unless the author rewrites it by hand.
				//   - User cleared the summary → re-derive. "Never empty" invariant.
				//   - User left the summary untouched AND body unchanged → skip
				//     the column entirely (Prisma treats `undefined` as no-op).
				if (previous != null) {
					const effectiveBody = postBody ?? previous.body
					const bodyChanged = postBody != null && postBody !== previous.body
					const authored =
						summary != null && summary !== "" && summary !== previous.summary

					if (authored) {
						data.summary = summary
					} else if (summary == null || summary === "") {
						data.summary = deriveSummary(effectiveBody)
					} else if (bodyChanged) {
						data.summary = deriveSummary(effectiveBody)
					}
				}

				const post = await tx.post.update({
					where: { id },
					data,
				})

				return { previous, post }
			},
			{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
		)

		revalidatePostSection(post.section)

		if (previous != null && previous.section !== post.section) {
			revalidatePostSection(previous.section)
		}
		// Audit trail. Includes prior section + slug so cross-section moves and
		// slug renames (driven by a title edit) are visible in logs distinct from
		// in-place body edits.
		auditLog("[api:admin:posts:PUT]", {
			id: post.id,
			slug: post.slug,
			section: post.section,
			sortOrder: null,
			previousSection: previous?.section ?? null,
			previousSlug:
				previous != null && previous.slug !== post.slug ? previous.slug : null,
			batchId: null,
		})

		return NextResponse.json(post)
	} catch (error) {
		const notFound = handlePrismaError(error, "[api:admin:posts:PUT]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:posts:PUT]", error)
	}
}

export async function DELETE(
	_request: Request,
	{ params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
	const idResult = await parseIdParam(params)

	if (idResult instanceof NextResponse) {
		return idResult
	}

	const { id } = idResult

	try {
		const post = await prisma.post.delete({
			where: { id },
			select: { section: true, slug: true },
		})

		revalidatePostSection(post.section)
		// Audit trail — deletions are the highest-stakes admin write.
		auditLog("[api:admin:posts:DELETE]", {
			id,
			slug: post.slug,
			section: post.section,
			sortOrder: null,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		return new NextResponse(null, { status: 204 })
	} catch (error) {
		const notFound = handlePrismaError(error, "[api:admin:posts:DELETE]")

		if (notFound) {
			return notFound
		}

		return respondInternalError("[api:admin:posts:DELETE]", error)
	}
}
