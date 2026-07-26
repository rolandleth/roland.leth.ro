import { NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api/apiErrors"
import { requireAdmin } from "@/lib/api/requireAdmin"
import { revalidateGuideSlugs } from "@/lib/db/guideRevalidation"
import { revalidateAllGuides } from "@/lib/db/guides"
import { revalidateAllPosts, revalidatePost } from "@/lib/db/posts"
import { revalidateAllProjects, revalidateProject } from "@/lib/db/projects"
import { isValidSection } from "@/lib/db/sections"

const TAG = "[api:admin:revalidate]"

// Session-gated by `src/proxy.ts` (every `/api/admin/*` request needs a valid
// JWT cookie). Companion to the import scripts: a direct-Prisma script write
// can't bust `unstable_cache` tags, so the admin pastes the slugs the script
// reports here to refresh exactly those pages. `"all"` is the sledgehammer
// fallback (every detail page of that type); an array is the precise path —
// posts as `section/slug`, projects as bare slugs.
const bodySchema = z
	.object({
		posts: z.union([z.literal("all"), z.array(z.string().min(1))]).optional(),
		projects: z
			.union([z.literal("all"), z.array(z.string().min(1))])
			.optional(),
		guides: z.union([z.literal("all"), z.array(z.string().min(1))]).optional(),
	})
	.refine(
		(value) =>
			value.posts !== undefined ||
			value.projects !== undefined ||
			value.guides !== undefined,
		{
			message: "Provide `posts`, `projects`, and/or `guides`",
		}
	)

type Selection = "all" | string[]
type ResourceKey = "posts" | "projects" | "guides"

/** Entries a batch declined to bust, with the reason the panel renders verbatim. */
interface SkippedEntries {
	entries: string[]
	reason: string
}

/**
 * What a batch actually did, echoed back to the panel. `skipped` names the
 * entries that were NOT busted and WHY — reporting them is the point of this
 * shape: silently dropping an entry while returning a bare success is how the
 * 2026-07 stale-404 stayed undiagnosable, with the panel showing "revalidated"
 * while nothing had been busted. The reason travels with the resource that
 * produced it so the panel never has to hard-code which resource can skip.
 */
interface Outcome {
	applied: "all" | string[]
	skipped: SkippedEntries | null
}

function applyPostsRevalidation(posts: Selection): Outcome {
	if (posts === "all") {
		revalidateAllPosts()

		return { applied: "all", skipped: null }
	}

	const applied: string[] = []
	const skipped: string[] = []

	for (const entry of posts) {
		// Entries are exactly `section/slug` — two segments, a known section, a
		// non-empty slug. A slug can't contain `/` (`createSlug` whitelists
		// `[a-z0-9-]`), so more than two segments is malformed, not a nested slug.
		const parts = entry.split("/")

		if (parts.length === 2 && isValidSection(parts[0]) && parts[1]) {
			revalidatePost(parts[0], parts[1])
			applied.push(entry)
		} else {
			skipped.push(entry)
		}
	}

	return {
		applied,
		skipped:
			skipped.length > 0
				? { entries: skipped, reason: "post entries must be section/slug" }
				: null,
	}
}

function applyProjectsRevalidation(projects: Selection): Outcome {
	if (projects === "all") {
		revalidateAllProjects()

		return { applied: "all", skipped: null }
	}

	for (const slug of projects) {
		revalidateProject(slug)
	}

	return { applied: projects, skipped: null }
}

async function applyGuidesRevalidation(guides: Selection): Promise<Outcome> {
	if (guides === "all") {
		revalidateAllGuides()

		return { applied: "all", skipped: null }
	}

	// Busts each slug's detail page and, for any slug that is a guide, its parent
	// topic hub (whose list would otherwise serve the guide's old title/summary).
	await revalidateGuideSlugs(guides)

	return { applied: guides, skipped: null }
}

/** Collapses applied arrays to counts so a big batch doesn't flood the log line. */
function summariseApplied(
	applied: Partial<Record<ResourceKey, Outcome["applied"]>>
): Record<string, string | number> {
	const summary: Record<string, string | number> = {}

	for (const [key, value] of Object.entries(applied)) {
		summary[key] = value === "all" ? "all" : value.length
	}

	return summary
}

function summariseSkipped(
	skipped: Partial<Record<ResourceKey, SkippedEntries>>
): Record<string, number> {
	const summary: Record<string, number> = {}

	for (const [key, value] of Object.entries(skipped)) {
		summary[key] = value.entries.length
	}

	return summary
}

export async function POST(request: Request): Promise<NextResponse> {
	const unauthorized = await requireAdmin(TAG)

	if (unauthorized) {
		return unauthorized
	}

	const parsed = await parseJsonBody(request, bodySchema, TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { posts, projects, guides } = parsed
	const applied: Partial<Record<ResourceKey, Outcome["applied"]>> = {}
	const skipped: Partial<Record<ResourceKey, SkippedEntries>> = {}
	const errors: Partial<Record<ResourceKey, string>> = {}

	// Each resource is busted independently: `revalidateTag` isn't transactional,
	// so if one resource throws (e.g. resolving guide parent hubs hits the DB and
	// fails) the buckets that already succeeded must still be reported. A bare 500
	// that discards them would send the operator back to retry and double-bust.
	async function runResource(
		key: ResourceKey,
		run: () => Outcome | Promise<Outcome>
	): Promise<void> {
		try {
			const outcome = await run()
			applied[key] = outcome.applied

			if (outcome.skipped != null) {
				skipped[key] = outcome.skipped
			}
		} catch (error) {
			// Generic message to the client (admin-only, but no reason to echo DB
			// internals); the full error goes to the server log for diagnosis.
			errors[key] = "revalidation failed"
			// eslint-disable-next-line no-console
			console.error(`${TAG} ${key} revalidation failed`, error)
		}
	}

	if (posts !== undefined) {
		await runResource("posts", () => applyPostsRevalidation(posts))
	}

	if (projects !== undefined) {
		await runResource("projects", () => applyProjectsRevalidation(projects))
	}

	if (guides !== undefined) {
		await runResource("guides", () => applyGuidesRevalidation(guides))
	}

	const hasErrors = Object.keys(errors).length > 0

	// Mirrors the keepalive route: a line so manual busts are distinguishable from
	// organic revalidation. Arrays are summarised to counts so a 500-slug "all"
	// batch doesn't dump every slug into one line.
	// eslint-disable-next-line no-console
	console.info(`${TAG} ${hasErrors ? "partial" : "success"}`, {
		applied: summariseApplied(applied),
		skipped: summariseSkipped(skipped),
		errors: Object.keys(errors),
	})

	// `revalidateTag` is fire-and-forget: it marks tags stale for the NEXT read,
	// it does not await in-flight renders. A 200/207 here means "busts issued",
	// not "every reader now sees fresh data". 207 (Multi-Status) flags a partial
	// batch so the panel can surface the errored resource without discarding the
	// ones that landed.
	return NextResponse.json(
		{ ok: !hasErrors, applied, skipped, errors },
		{ status: hasErrors ? 207 : 200 }
	)
}
