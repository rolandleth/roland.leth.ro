import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
 *
 *      Placement is NOT the same as "guarded", and this file asserts the former
 *      only. Next does not re-execute a layout on a client-side navigation
 *      within the same segment, so a page under `(protected)/` can still run its
 *      body on a request where the layout check did not — `guides/new/page.tsx`
 *      and `guide-topics/new/page.tsx` both call `getProjectsForAdmin()` that
 *      way. The `/admin/:path*` matcher in `src/proxy.ts` bounds it, so this is
 *      an accuracy caveat on invariant 1 rather than an open hole.
 *   2. Every page that reads a row in `generateMetadata` routes it through
 *      `adminEditMetadata` with its own tag. `generateMetadata` runs outside the
 *      layout, so it is the one place on an admin page that can read a row with
 *      the layout's check never having run.
 *
 * Asserted by IMPORTING each page and CALLING `generateMetadata`, not by
 * matching its source text. The source-text form claimed to prove "a fifth edit
 * page can't ship without the guard" and did not: an import line plus the
 * literal `tag: ADMIN_EDIT_TAGS.x` anywhere in the file passed it, with no
 * `generateMetadata` export at all and no call to anything. The API-side sibling
 * has always called its handlers; this now matches.
 */

vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn().mockResolvedValue(false),
}))

vi.mock("next/cache", async () => {
	const { nextCacheMockFactory } = await import("@/test/mocks/nextCache")

	return nextCacheMockFactory()
})

vi.mock("@/lib/db/db", () => ({
	prisma: {},
	isPrismaUniqueConstraint: vi.fn().mockReturnValue(false),
}))

const ADMIN_DIR = __dirname
const PROTECTED_SEGMENT = "(protected)"

/** `page.tsx` paths under `src/app/admin`, relative to it, in POSIX form. */
function adminPages(): string[] {
	return readdirSync(ADMIN_DIR, { recursive: true, encoding: "utf8" })
		.filter((entry) => entry.endsWith("page.tsx"))
		.map((entry) => entry.replaceAll("\\", "/"))
		.sort()
}

/**
 * The URL a discovered `page.tsx` serves. Route groups add no URL segment, so
 * `(protected)/posts/[id]/edit/page.tsx` serves `/admin/posts/[id]/edit`.
 */
function routeFor(page: string): string {
	const segments = dirname(page)
		.split("/")
		.filter((segment) => !segment.startsWith("("))

	return `/admin/${segments.join("/")}`
}

/**
 * Whether a page's source declares a `generateMetadata` export, in either of
 * the two shapes TypeScript accepts for it.
 *
 * A literal `.includes("export async function generateMetadata")` — this
 * predicate's previous form — matched only the function-declaration shape.
 * `export const generateMetadata = async (...) => ...` compiles identically
 * and Next treats it identically, but would silently fall out of
 * `metadataPages` below with no assertion covering it: the exact source-text
 * weakness the docblock above says this rewrite removed, reintroduced here.
 */
function hasGenerateMetadataExport(source: string): boolean {
	return /export\s+(?:async\s+function|const)\s+generateMetadata\b/.test(source)
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
		const layouts = readdirSync(`${ADMIN_DIR}/${PROTECTED_SEGMENT}`, {
			encoding: "utf8",
		})

		expect(layouts).toContain("layout.tsx")
	})
})

// #endregion

// #region metadata guard

interface MetadataPage {
	/** Route the page serves, used as the test label. */
	route: string
	/** The tag this page's log lines must carry — NOT looked up from the module. */
	tag: string
	/** Human-readable title the guard must fall back to. */
	fallback: string
	load: () => Promise<{
		generateMetadata?: (args: {
			params: Promise<{ id: string }>
		}) => Promise<{ title?: unknown }>
	}>
}

/**
 * Every admin page whose `generateMetadata` reads a row, with the tag it is
 * required to use, written out here rather than read from the module.
 *
 * That is the whole point of the list: the old test extracted the tag from the
 * page's own source and then checked it against itself, so two pages could swap
 * tags and every assertion still passed. Stating the expected pairing
 * independently is what makes a transposition fail.
 */
const metadataPages: MetadataPage[] = [
	{
		route: "/admin/posts/[id]/edit",
		tag: ADMIN_EDIT_TAGS.posts,
		fallback: "Edit post",
		load: () => import("./(protected)/posts/[id]/edit/page"),
	},
	{
		route: "/admin/projects/[id]/edit",
		tag: ADMIN_EDIT_TAGS.projects,
		fallback: "Edit project",
		load: () => import("./(protected)/projects/[id]/edit/page"),
	},
	{
		route: "/admin/guides/[id]/edit",
		tag: ADMIN_EDIT_TAGS.guides,
		fallback: "Edit guide",
		load: () => import("./(protected)/guides/[id]/edit/page"),
	},
	{
		route: "/admin/guide-topics/[id]/edit",
		tag: ADMIN_EDIT_TAGS.guideTopics,
		fallback: "Edit topic",
		load: () => import("./(protected)/guide-topics/[id]/edit/page"),
	},
]

beforeEach(() => {
	// Each rejection logs at error level; all of them are expected here.
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe.each(metadataPages)("$route", ({ tag, fallback, load }) => {
	it("exports generateMetadata", async () => {
		// The gap the source-text form left open: a page could import
		// `adminEditMetadata`, mention the tag, and export nothing.
		const pageModule = await load()

		expect(typeof pageModule.generateMetadata).toBe("function")
	})

	it("falls back rather than reading the row without a session", async () => {
		// The guard's actual product. A request that slipped past the
		// `src/proxy.ts` matcher would otherwise reach the loader and render an
		// unpublished record's name into the `<title>` of a page it was never
		// allowed to see.
		const pageModule = await load()
		const metadata = await pageModule.generateMetadata?.({
			params: Promise.resolve({ id: "1" }),
		})

		expect(metadata?.title).toBe(fallback)
	})

	it("attributes its bypass line to its own tag", async () => {
		// The tag is what attributes a security line to a page, and it is checked
		// against the expected value declared above — not against whatever the
		// page's source happens to contain.
		const pageModule = await load()

		await pageModule.generateMetadata?.({
			params: Promise.resolve({ id: "1" }),
		})

		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			expect.stringContaining(tag),
			expect.objectContaining({ surface: "generateMetadata" })
		)
	})
})

describe("routeFor", () => {
	// The walker's one piece of real logic, tested on synthetic input so a
	// predicate that silently narrowed the discovered set can't pass. The old
	// non-vacuity guards only checked `length > 0`, which a typo survives.
	it.each([
		["(protected)/posts/[id]/edit/page.tsx", "/admin/posts/[id]/edit"],
		["login/page.tsx", "/admin/login"],
		// The shapes the previous `/edit/page.tsx` predicate missed entirely.
		["(protected)/posts/[id]/page.tsx", "/admin/posts/[id]"],
		["(protected)/posts/[id]/preview/page.tsx", "/admin/posts/[id]/preview"],
		// Route groups add no URL segment, however many are nested.
		["(protected)/(inner)/guides/page.tsx", "/admin/guides"],
	])("maps %s to %s", (page, expected) => {
		expect(routeFor(page)).toBe(expected)
	})
})

describe("hasGenerateMetadataExport", () => {
	// Tested on synthetic input for the same reason as `routeFor` above: a
	// predicate that silently narrows the discovered set passes vacuously
	// against the real filesystem, since every current page happens to use the
	// same shape.
	it.each([
		[
			"the function-declaration form",
			"export async function generateMetadata({ params }) {}",
			true,
		],
		[
			"the const-arrow form",
			"export const generateMetadata = async ({ params }) => {}",
			true,
		],
		[
			"a page with no generateMetadata export",
			"export default function Page() {}",
			false,
		],
		[
			"a bare mention with no export",
			"// see generateMetadata in the sibling route",
			false,
		],
	])("detects %s", (_label, source, expected) => {
		expect(hasGenerateMetadataExport(source)).toBe(expected)
	})
})

describe("the metadata-page list", () => {
	it("covers every admin page that reads a row in generateMetadata", () => {
		// Guards the "listed explicitly" decision above. The previous walker keyed
		// on `/edit/page.tsx`, but the invariant is about any admin page reading a
		// row in `generateMetadata` — a `[id]/page.tsx` or `[id]/preview/page.tsx`
		// got no assertion and did not perturb the count, which made the gap look
		// closed. This keys on the guard's own name instead, so a new page shape
		// still has to be listed.
		const discovered = adminPages()
			.filter((page) =>
				hasGenerateMetadataExport(readFileSync(join(ADMIN_DIR, page), "utf8"))
			)
			.map(routeFor)
			.sort()
		const listed = metadataPages.map(({ route }) => route).sort()

		expect(discovered).toEqual(listed)
	})

	it("gives every listed page a distinct tag", () => {
		const tags = metadataPages.map(({ tag }) => tag)

		expect(new Set(tags).size).toBe(tags.length)
	})

	it("has one tag per listed page, and no spares", () => {
		// Drift in either direction is a bug: an unused tag means a page was
		// deleted or renamed without cleaning up, and a missing one means a new
		// page has nowhere correct to point.
		expect(metadataPages).toHaveLength(Object.keys(ADMIN_EDIT_TAGS).length)
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
