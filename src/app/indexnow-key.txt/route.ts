import { getIndexNowKey } from "@/lib/auth/env"

// IndexNow verification file. The search engine fetches this URL and checks its
// contents equal the `key` in a submission — so it must serve the exact key,
// nothing more. Hosted at a stable path (not `/{key}.txt`) and referenced via
// the submission's `keyLocation`, so the key lives only in env, never in a
// committed file that could drift. The key is a public verification token by
// design, not a secret — serving it openly is how the protocol works.
//
// `force-dynamic`: read the key from env per request. Prerendering would bake
// whatever value existed at build time (or a 404 if unset then) into the static
// output, defeating the point of sourcing it from env.
export const dynamic = "force-dynamic"

export function GET(): Response {
	const key = getIndexNowKey()

	if (key === null) {
		return new Response("Not found", { status: 404 })
	}

	return new Response(key, {
		status: 200,
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			// Rarely fetched (only on verification), and must reflect an env change
			// on the next crawl, so it's deliberately not cached.
			"Cache-Control": "no-store",
		},
	})
}
