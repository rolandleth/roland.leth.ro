import { redirect } from "next/navigation"
import { cache } from "react"
import { verifySession } from "@/lib/auth/auth"
import { randomShortId } from "@/lib/utils/randomShortId"
import type { AdminPageTag } from "./adminTags"

/**
 * The guards that sit behind the `src/proxy.ts` matcher. Each names where the
 * request surfaced, so one alert rule can distinguish "an API handler ran
 * unauthenticated" from "a page body rendered unauthenticated".
 */
export type BypassSurface =
	"the handler" | "the protected layout" | "generateMetadata" | "the page body"

/**
 * One id per request, shared by every guard that fires for it.
 *
 * A bypassed *page* request trips two guards independently — `generateMetadata`
 * (via `adminEditMetadata`) and the protected layout — because Next runs the
 * two outside each other. Without a shared field they are two `console.error`
 * lines with different tags and nothing linking them, so a count-based alert
 * double-counts and no operator can tell one bypass from two.
 *
 * `cache` is React's per-request memo, which Next scopes across
 * `generateMetadata`, layouts, and pages of the same request — exactly the two
 * call sites that need to agree. The id is minted lazily, so a request that
 * trips no guard pays nothing.
 *
 * API handlers trip exactly one guard, so their line needs no correlation; the
 * id is still emitted for a uniform shape, and is simply unique per line there.
 *
 * Exported for the other lines in this defence layer that log outside
 * `logMiddlewareBypass` — `adminEditMetadata`'s `loadName` failure is one — so
 * they can join the same request rather than emitting an uncorrelated line.
 */
export const bypassIdForRequest = cache(randomShortId)

/**
 * Reports an unauthenticated request that reached a guard behind the middleware
 * matcher.
 *
 * Logged at error level precisely because it should be unreachable: the
 * middleware 401s or redirects these before they get here, so a line means the
 * `src/proxy.ts` matcher missed the path. That is a security event, not a
 * routine 401 — and it is the only signal that the matcher has a hole.
 *
 * The message text is single-sourced here rather than hand-copied into each
 * guard: it is the one greppable invariant across all three, so rewording it in
 * one place would silently drop that guard out of any alert rule built on the
 * string.
 *
 * @param tag Route- or page-identifying tag, e.g. `[api:admin:posts:POST]`.
 * @param context Structured payload. `id` is the record id where the guard has
 * one in hand — for a matcher hole, the value that got through is what narrows
 * the search for which path did.
 */
export function logMiddlewareBypass(
	tag: string,
	surface: BypassSurface,
	context: { id?: string } = {}
): void {
	// eslint-disable-next-line no-console
	console.error(
		`${tag} unauthenticated request reached ${surface} — the middleware gate did not run for this path`,
		{ bypassId: bypassIdForRequest(), surface, ...context }
	)
}

/**
 * Body-level session re-check for an admin page that reads data before
 * rendering.
 *
 * `ProtectedLayout` already re-checks the session once, but Next does not
 * re-run a layout on a client-side navigation within the same route segment —
 * so a page reached that way runs its body on a request the layout's check
 * never saw. Redirects exactly like the layout does, so a bypass is
 * indistinguishable from an ordinary unauthenticated visit; `logMiddlewareBypass`
 * is what makes it visible in the logs.
 *
 * Call before any data read the page's body performs — including a page that
 * ALSO has a `generateMetadata` routed through `adminEditMetadata`.
 * `adminEditMetadata`'s check is a title-only fallback: it logs and returns a
 * fallback `<title>`, but `generateMetadata` and the page body are independent
 * functions Next calls separately, so it does not stop the body from
 * rendering. It carries no equivalent of this check; every page whose body
 * reads a row needs its own call here regardless of what its
 * `generateMetadata` does.
 *
 * MUST be awaited. `redirect()` throws synchronously once reached, but
 * `verifySession()` above it is real async work (a cookie read + JWT verify),
 * so the throw doesn't happen until a microtask boundary inside this
 * function. An unawaited `requireAdminPageSession(tag)` returns a floating
 * promise, and the calling function's next line runs immediately — very
 * likely before that promise even settles, let alone rejects. There is no
 * lint rule catching this (`eslint.config.mjs` uses `tseslint.configs.strict`,
 * not `strictTypeChecked`, so `no-floating-promises` is off); discipline at
 * the call site is what stops it.
 */
export async function requireAdminPageSession(
	tag: AdminPageTag
): Promise<void> {
	const isAuthenticated = await verifySession()

	if (!isAuthenticated) {
		logMiddlewareBypass(tag, "the page body")
		redirect("/admin/login")
	}
}
