import { readdirSync } from "node:fs"
import { dirname } from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Contract test: every exported handler under `/api/admin` refuses a request
 * with no session, on its own, without help from the middleware.
 *
 * `src/proxy.test.ts` has the mirror-image contract (every admin path is gated
 * by the middleware), but it calls `proxy()` directly — which presumes the
 * request reached the middleware at all. A path the matcher fails to cover
 * bypasses both the gate and that test. This file covers the other half: even
 * if nothing gated the request, the handler says no.
 *
 * A new admin route added without `requireAdmin` fails here.
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

vi.mock("@vercel/blob", () => ({ put: vi.fn() }))

vi.mock("@/app/sitemap", () => ({ default: vi.fn().mockResolvedValue([]) }))

vi.mock("@/lib/api/keepalive", () => ({
	KEEPALIVE_KEY: "keepalive:last",
	getKeepaliveRedis: vi.fn().mockReturnValue(null),
	writeKeepalive: vi.fn(),
}))

type Handler = (
	request: Request,
	context: { params: Promise<{ id: string }> }
) => Promise<Response>

/**
 * Every admin route module, by the path a request would reach it on. Listed
 * explicitly rather than globbed: a glob that silently matched nothing would
 * turn this file into a test that always passes.
 */
const routeModules: Array<{ path: string; load: () => Promise<unknown> }> = [
	{ path: "/api/admin/posts", load: () => import("./posts/route") },
	{ path: "/api/admin/posts/[id]", load: () => import("./posts/[id]/route") },
	{ path: "/api/admin/posts/bulk", load: () => import("./posts/bulk/route") },
	{ path: "/api/admin/projects", load: () => import("./projects/route") },
	{
		path: "/api/admin/projects/[id]",
		load: () => import("./projects/[id]/route"),
	},
	{ path: "/api/admin/guides", load: () => import("./guides/route") },
	{ path: "/api/admin/guides/[id]", load: () => import("./guides/[id]/route") },
	{
		path: "/api/admin/guide-topics",
		load: () => import("./guide-topics/route"),
	},
	{
		path: "/api/admin/guide-topics/[id]",
		load: () => import("./guide-topics/[id]/route"),
	},
	{ path: "/api/admin/upload", load: () => import("./upload/route") },
	{ path: "/api/admin/revalidate", load: () => import("./revalidate/route") },
	{ path: "/api/admin/indexnow", load: () => import("./indexnow/route") },
	{ path: "/api/admin/keepalive", load: () => import("./keepalive/route") },
]

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

beforeEach(() => {
	// The guard logs at error level on every rejection; these are all expected.
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

describe.each(routeModules)("$path", ({ load }) => {
	it("refuses every exported handler without a session", async () => {
		const routeModule = (await load()) as Record<string, Handler | undefined>
		const exported = HTTP_METHODS.filter(
			(method) => typeof routeModule[method] === "function"
		)

		// A module with no handlers means the list above drifted from the tree.
		expect(exported.length).toBeGreaterThan(0)

		for (const method of exported) {
			const handler = routeModule[method] as Handler
			const request = new Request("http://localhost/api/admin/probe", {
				method: method === "GET" ? "GET" : method,
			})
			const response = await handler(request, {
				params: Promise.resolve({ id: "1" }),
			})

			expect(
				response.status,
				`${method} answered ${response.status} without a session`
			).toBe(401)
		}
	})
})

describe("the route list", () => {
	it("covers every route module in the tree", () => {
		// Guards the "listed explicitly" decision above: if a new admin route
		// file appears and nobody adds it here, this fails instead of the new
		// route silently going unchecked.
		const discovered = readdirSync(__dirname, {
			recursive: true,
			encoding: "utf8",
		})
			.filter((entry) => entry.endsWith(`route.ts`))
			.map((entry) => `/api/admin/${dirname(entry)}`.replace(/\/\.$/, ""))
			.sort()
		const listed = routeModules.map(({ path }) => path).sort()

		expect(discovered).toEqual(listed)
	})
})
