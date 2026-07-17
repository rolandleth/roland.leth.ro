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

function revalidatePosts(posts: Selection): void {
	if (posts === "all") {
		revalidateAllPosts()

		return
	}

	for (const entry of posts) {
		// Entries are `section/slug`; a slug can't contain `/` (`createSlug`
		// whitelists `[a-z0-9-]`), so a plain split is safe. Silently skip a
		// malformed or unknown-section entry rather than fail the whole batch.
		const [section, slug] = entry.split("/")

		if (isValidSection(section) && slug) {
			revalidatePost(section, slug)
		}
	}
}

function revalidateProjects(projects: Selection): void {
	if (projects === "all") {
		revalidateAllProjects()

		return
	}

	for (const slug of projects) {
		revalidateProject(slug)
	}
}

function revalidateGuides(guides: Selection): void {
	if (guides === "all") {
		revalidateAllGuides()

		return
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
}

export async function POST(request: Request): Promise<NextResponse> {
	const parsed = await parseJsonBody(request, bodySchema, TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const { posts, projects, guides } = parsed

	try {
		if (posts !== undefined) {
			revalidatePosts(posts)
		}

		if (projects !== undefined) {
			revalidateProjects(projects)
		}

		if (guides !== undefined) {
			revalidateGuides(guides)
		}
	} catch (error) {
		return respondInternalError(TAG, error)
	}

	// Mirrors the keepalive route: a success line so manual busts are
	// distinguishable from organic revalidation in the logs.
	// eslint-disable-next-line no-console
	console.info(`${TAG} success`, { posts, projects, guides })

	return NextResponse.json({ ok: true })
}
