import { NextResponse } from "next/server"
import { refuseCrossSiteWrite } from "@/lib/api/sameOrigin"
import { destroySession } from "@/lib/auth/auth"

const TAG = "[api:auth:logout]"

export async function POST(request: Request): Promise<NextResponse> {
	// Outside `/api/admin`, so no `requireAdmin`: logging out needs no session.
	// A cross-site POST could still end the admin's session from any
	// `*.leth.ro` page, which is only a nuisance, but the check is free.
	const crossSite = refuseCrossSiteWrite(request, TAG)

	if (crossSite) {
		return crossSite
	}

	await destroySession()

	// Pairs with `[api:auth:login] success`, so a session's end is in the log
	// next to its start.
	// eslint-disable-next-line no-console
	console.info(`${TAG} success`)

	return NextResponse.json({ ok: true })
}
