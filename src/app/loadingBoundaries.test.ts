import { existsSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// A `loading.tsx` anywhere at or above a route creates a Suspense boundary, and
// that boundary is what lets React commit a 200 and stream the shell before the
// page resolves. A status can't be revised after the first byte, so a later
// `notFound()` only swaps the boundary's content: the 404 page renders under a
// 200, and every guessed slug looks like a real page to a crawler. Confirmed in
// production on 2026-08-17, and fixed by scoping the two list skeletons into
// `(list)` / `(gallery)` route groups and dropping the two detail ones.
//
// Nothing about that arrangement announces itself — the groups look cosmetic,
// and re-adding a skeleton to a post page is an obviously reasonable thing to
// do. This test is the only thing that makes the constraint enforced rather
// than remembered, so it asserts on the filesystem rather than on behavior:
// catching it needs a production build, which no unit test can run.
//
// `redirect()` has the identical dependency, for the identical reason — it
// rewrites the response, and a flushed shell can't be rewritten either, so a
// boundary above the route degrades a server redirect into a client-side one.
// That makes `ROUTES_REQUIRING_REAL_404` narrower than what this file actually
// protects: `/admin` isn't in that list (it has no 404 path) but its
// out-of-range page correction is a `redirect()` from `AdminPagination`, and
// `requireAdminPageSession`'s auth redirect fires from every protected page
// body. Both are covered by the catch-all at the bottom, which is the test
// that matters most here — the named list is the documentation, the catch-all
// is the enforcement.

const APP_DIR = join(process.cwd(), "src", "app")

/**
 * Routes that must return a real 404 for an unknown param. Each entry is the
 * app-relative directory of the route, and every ancestor up to `src/app` is
 * checked — a boundary blocks the routes nested below it, not just its own.
 *
 * `/blog/:section` and `/blog/:section/archive` are deliberately absent: their
 * params come from the `SECTIONS` constant, so they carry `dynamicParams = false`
 * and Next serves `/_not-found` without rendering them at all. That is why
 * `blog/[section]/archive/loading.tsx` is still allowed to exist.
 */
const ROUTES_REQUIRING_REAL_404 = [
	"blog/[section]/[slug]",
	"blog/[section]/p/[page]",
	"projects/[slug]",
	"guides/[slug]",
	"admin/(protected)/posts/[id]/edit",
	"admin/(protected)/guides/[id]/edit",
	"admin/(protected)/guide-topics/[id]/edit",
	"admin/(protected)/projects/[id]/edit",
]

/** Every directory from the route up to (and including) `src/app`. */
function ancestorsOf(routeDir: string): string[] {
	const segments = routeDir.split("/")

	return segments.map((_, index) =>
		join(APP_DIR, ...segments.slice(0, segments.length - index))
	)
}

describe("loading boundaries above routes that must 404", () => {
	it.each(ROUTES_REQUIRING_REAL_404)(
		"has no loading.tsx at or above %s",
		(routeDir) => {
			const offenders = [...ancestorsOf(routeDir), APP_DIR].filter((dir) =>
				existsSync(join(dir, "loading.tsx"))
			)

			expect(offenders).toEqual([])
		}
	)

	it("still guards routes that exist", () => {
		// The check above passes vacuously if a route is renamed and this list
		// isn't updated, which would silently stop guarding it.
		for (const routeDir of ROUTES_REQUIRING_REAL_404) {
			expect(existsSync(join(APP_DIR, routeDir))).toBe(true)
		}
	})

	it("keeps the list skeletons that the route groups preserve", () => {
		// The other half of the trade: the groups exist so these two survive. If
		// they vanish, the groups are pure overhead and should go too.
		expect(existsSync(join(APP_DIR, "blog/[section]/(list)/loading.tsx"))).toBe(
			true
		)
		expect(existsSync(join(APP_DIR, "projects/(gallery)/loading.tsx"))).toBe(
			true
		)
	})

	it("does not have a stray page.tsx beside a grouped one", () => {
		// Moving `page.tsx` into `(list)` while leaving one behind would make the
		// route ambiguous, and Next resolves that at build time, not here.
		expect(existsSync(join(APP_DIR, "blog/[section]/page.tsx"))).toBe(false)
		expect(existsSync(join(APP_DIR, "projects/page.tsx"))).toBe(false)
	})

	it("finds no loading.tsx that was added without updating this list", () => {
		// Belt and braces: any NEW loading.tsx anywhere under src/app should be a
		// deliberate decision made with this file open. Walks the whole app, not
		// just blog/ and projects/ — a loading.tsx added above `guides/[slug]` or
		// an admin edit route would be the identical bug in a directory this test
		// used to be blind to.
		const known = [
			join(APP_DIR, "blog/[section]/(list)/loading.tsx"),
			join(APP_DIR, "blog/[section]/archive/loading.tsx"),
			join(APP_DIR, "projects/(gallery)/loading.tsx"),
		]

		function walk(dir: string): string[] {
			return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
				const path = join(dir, entry.name)

				if (entry.isDirectory()) {
					return walk(path)
				}

				return entry.name === "loading.tsx" ? [path] : []
			})
		}

		expect(walk(APP_DIR).sort()).toEqual(known.sort())
	})
})
