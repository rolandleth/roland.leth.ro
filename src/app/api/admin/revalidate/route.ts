import { NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody, respondInternalError } from "@/lib/api/apiErrors"
import {
	revalidateAllGuides,
	revalidateGuide,
	revalidateGuideTopic,
} from "@/lib/db/guides"
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

/**
 * What a batch actually did, echoed back to the panel. `skipped` lists the
 * entries that were NOT busted (malformed, unknown section) — reporting them is
 * the point of this shape: silently dropping an entry while returning a bare
 * success is how the 2026-07 stale-404 stayed undiagnosable, with the panel
 * showing "revalidated" while nothing had been busted.
 */
interface Outcome {
	applied: "all" | string[]
	skipped: string[]
}

function revalidatePosts(posts: Selection): Outcome {
	if (posts === "all") {
		revalidateAllPosts()

		return { applied: "all", skipped: [] }
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

	return { applied, skipped }
}

function revalidateProjects(projects: Selection): Outcome {
	if (projects === "all") {
		revalidateAllProjects()

		return { applied: "all", skipped: [] }
	}

	for (const slug of projects) {
		revalidateProject(slug)
	}

	return { applied: projects, skipped: [] }
}

function revalidateGuides(guides: Selection): Outcome {
	if (guides === "all") {
		revalidateAllGuides()

		return { applied: "all", skipped: [] }
	}

	for (const slug of guides) {
		// Guides and topics share one flat slug namespace but carry distinct tags,
		// and a pasted slug doesn't say which kind it is. Busting both is a no-op
		// for whichever tag doesn't exist — cheaper than a lookup per slug just to
		// pick one.
		//
		// This refreshes a topic's own hub, not the parent link on each of its
		// guides. A script that flips a topic's publish state should use `"all"`;
		// a body or title edit doesn't need to.
		revalidateGuide(slug)
		revalidateGuideTopic(slug)
	}

	return { applied: guides, skipped: [] }
}

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = await parseJsonBody(request, bodySchema, TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { posts, projects, guides } = parsed
	const applied: Partial<Record<ResourceKey, Outcome["applied"]>> = {}
	const skipped: Partial<Record<ResourceKey, string[]>> = {}

	// Collects each resource's outcome into the response maps; `skipped` keys
	// only appear when something was actually dropped, so the panel can treat
	// any key's presence as a warning.
	function collect(key: ResourceKey, outcome: Outcome): void {
		applied[key] = outcome.applied

		if (outcome.skipped.length > 0) {
			skipped[key] = outcome.skipped
		}
	}

	try {
		if (posts !== undefined) {
			collect("posts", revalidatePosts(posts))
		}

		if (projects !== undefined) {
			collect("projects", revalidateProjects(projects))
		}

		if (guides !== undefined) {
			collect("guides", revalidateGuides(guides))
		}
	} catch (error) {
		return respondInternalError(TAG, error)
	}

	// Mirrors the keepalive route: a success line so manual busts are
	// distinguishable from organic revalidation in the logs. Logs what was
	// actually busted vs dropped, not just the raw input.
	// eslint-disable-next-line no-console
	console.info(`${TAG} success`, { applied, skipped })

	return NextResponse.json({ ok: true, applied, skipped })
}
