import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, expect, it } from "vitest"
import { ADMIN_EDIT_TAGS } from "@/lib/auth/adminMetadata"

/**
 * Contract test for the `/admin` page namespace — the mirror of
 * `src/app/api/admin/adminAuthContract.test.ts`, which does the same job for
 * `/api/admin`.
 *
 * `src/proxy.ts` describes two invariants in a comment and nothing enforced
 * them, so the page side's fourth defence layer was opt-in on the next author
 * reading a comment in a different file:
 *
 *   1. Every admin page sits under `(protected)/`, whose layout re-checks the
 *      session. `/admin/login` is the deliberate exception — it is the page an
 *      unauthenticated request is redirected *to*.
 *   2. Every edit page routes `generateMetadata` through `adminEditMetadata`
 *      with its own tag. `generateMetadata` runs outside the layout, so it is
 *      the one place on an admin page that can read a row with the layout's
 *      check never having run.
 *
 * Asserted against the page sources rather than by importing the modules: the
 * per-page tests (`posts/[id]/edit/page.test.tsx` and its three siblings)
 * already exercise the runtime behaviour with a mocked session. What was
 * missing is *exhaustiveness* — proof that a fifth edit page can't ship without
 * the guard — and that is a question about the set of files, not about any one
 * page's behaviour.
 */

const ADMIN_DIR = __dirname
const PROTECTED_SEGMENT = "(protected)"

/** `page.tsx` paths under `src/app/admin`, relative to it, in POSIX form. */
function adminPages(): string[] {
	return readdirSync(ADMIN_DIR, { recursive: true, encoding: "utf8" })
		.filter((entry) => entry.endsWith("page.tsx"))
		.map((entry) => entry.replaceAll("\\", "/"))
		.sort()
}

// #region page placement

describe("admin page placement", () => {
	it("finds pages at all, so a broken walk can't pass vacuously", () => {
		expect(adminPages().length).toBeGreaterThan(0)
	})

	it("keeps every admin page under the protected layout except the login page", () => {
		const unprotected = adminPages().filter(
			(page) => !page.startsWith(`${PROTECTED_SEGMENT}/`)
		)

		// A page outside `(protected)/` renders its body with no session check —
		// the matcher in `src/proxy.ts` would be the only thing in front of it.
		expect(unprotected).toEqual(["login/page.tsx"])
	})

	it("has a layout guarding the protected segment", () => {
		const layouts = readdirSync(join(ADMIN_DIR, PROTECTED_SEGMENT), {
			encoding: "utf8",
		})

		expect(layouts).toContain("layout.tsx")
	})
})

// #endregion

// #region edit-page tags

/** Edit pages discovered in the tree, keyed by their route-ish directory. */
function editPages(): { route: string; source: string }[] {
	return adminPages()
		.filter((page) => page.endsWith("/edit/page.tsx"))
		.map((page) => ({
			route: dirname(page),
			source: readFileSync(join(ADMIN_DIR, page), "utf8"),
		}))
}

describe("admin edit pages", () => {
	it("finds edit pages at all, so a broken filter can't pass vacuously", () => {
		expect(editPages().length).toBeGreaterThan(0)
	})

	it("has one tag per edit page, and no spares", () => {
		// Drift in either direction is a bug: an unused tag means a page was
		// deleted or renamed without cleaning up, and a missing one means a new
		// page has nowhere correct to point.
		expect(editPages()).toHaveLength(Object.keys(ADMIN_EDIT_TAGS).length)
	})

	describe.each(editPages())("$route", ({ source }) => {
		it("routes generateMetadata through adminEditMetadata", () => {
			expect(source).toContain("adminEditMetadata")
		})

		// The tag is what attributes a security line to a page. A bare string
		// literal here would be copy-pasteable between pages with nothing failing,
		// which is why `ADMIN_EDIT_TAGS` exists and why the source has to use it.
		it("takes its tag from ADMIN_EDIT_TAGS rather than a bare literal", () => {
			expect(source).toMatch(/tag:\s*ADMIN_EDIT_TAGS\.\w+/)
		})
	})

	it("gives every edit page a distinct tag", () => {
		const used = editPages().map(
			({ source }) => /tag:\s*ADMIN_EDIT_TAGS\.(\w+)/.exec(source)?.[1]
		)

		expect(used).not.toContain(undefined)
		expect(new Set(used).size).toBe(used.length)
	})

	it("uses only keys that exist on ADMIN_EDIT_TAGS", () => {
		const used = editPages().flatMap(
			({ source }) => /tag:\s*ADMIN_EDIT_TAGS\.(\w+)/.exec(source)?.[1] ?? []
		)

		for (const key of used) {
			expect(Object.keys(ADMIN_EDIT_TAGS)).toContain(key)
		}
	})
})

// #endregion

// #region tag shape

describe("ADMIN_EDIT_TAGS", () => {
	it("gives every page a distinct value", () => {
		const values = Object.values(ADMIN_EDIT_TAGS)

		expect(new Set(values).size).toBe(values.length)
	})

	// The shape alert rules grep for. `[admin:` distinguishes a page-side line
	// from the API side's `[api:admin:`, which matters because the two namespaces
	// have different defence layers behind them.
	it("uses the [admin:<page>:edit] shape", () => {
		for (const tag of Object.values(ADMIN_EDIT_TAGS)) {
			expect(tag).toMatch(/^\[admin:[a-z-]+:edit\]$/)
		}
	})
})

// #endregion
