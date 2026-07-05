import { NextResponse } from "next/server"
import { respondInternalError } from "@/lib/api/apiErrors"
import { revalidatePostSection } from "@/lib/db/posts"
import { revalidateAllProjects } from "@/lib/db/projects"
import { SECTIONS } from "@/lib/db/sections"

// Session-gated by `src/proxy.ts` (every `/api/admin/*` request requires a
// valid JWT cookie). Companion to the import scripts: a direct-Prisma script
// write can't bust `unstable_cache` tags, so this gives the admin a one-click
// "make everything fresh" after an import run. Over-busting is deliberate —
// the cost is a handful of cache misses, the benefit is not having to reason
// about which tags a given run touched.
export async function POST(): Promise<NextResponse> {
	try {
		for (const section of SECTIONS) {
			revalidatePostSection(section)
		}

		revalidateAllProjects()
	} catch (error) {
		return respondInternalError("[api:admin:revalidate]", error)
	}

	// Mirrors the keepalive route: a success line so manual busts are
	// distinguishable from organic revalidation in the logs.
	// eslint-disable-next-line no-console
	console.info("[api:admin:revalidate] success", { sections: SECTIONS })

	return NextResponse.json({ ok: true, sections: SECTIONS })
}
