import { readdirSync } from "node:fs"
import { dirname } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"

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

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const

type HttpMethod = (typeof HTTP_METHODS)[number]

/** A route handler file under any extension Next accepts for one. */
const ROUTE_FILE = /(^|\/)route\.(js|jsx|ts|tsx|mjs|mts)$/

/**
 * Every admin route module, by the path a request would reach it on. Listed
 * explicitly rather than globbed: a glob that silently matched nothing would
 * turn this file into a test that always passes.
 *
 * `jsonBodyMethods` names the handlers that read a JSON body; each must refuse a
 * non-JSON `Content-Type` with a 415 before it parses anything.
 */
const routeModules: Array<{
	path: string
	load: () => Promise<unknown>
	jsonBodyMethods: HttpMethod[]
}> = [
	{
		path: "/api/admin/posts",
		load: () => import("./posts/route"),
		jsonBodyMethods: ["POST"],
	},
	{
		path: "/api/admin/posts/[id]",
		load: () => import("./posts/[id]/route"),
		jsonBodyMethods: ["PUT"],
	},
	{
		path: "/api/admin/posts/bulk",
		load: () => import("./posts/bulk/route"),
		jsonBodyMethods: ["POST"],
	},
	{
		path: "/api/admin/projects",
		load: () => import("./projects/route"),
		jsonBodyMethods: ["POST"],
	},
	{
		path: "/api/admin/projects/[id]",
		load: () => import("./projects/[id]/route"),
		jsonBodyMethods: ["PUT"],
	},
	{
		path: "/api/admin/guides",
		load: () => import("./guides/route"),
		jsonBodyMethods: ["POST"],
	},
	{
		path: "/api/admin/guides/[id]",
		load: () => import("./guides/[id]/route"),
		jsonBodyMethods: ["PUT"],
	},
	{
		path: "/api/admin/guide-topics",
		load: () => import("./guide-topics/route"),
		jsonBodyMethods: ["POST"],
	},
	{
		path: "/api/admin/guide-topics/[id]",
		load: () => import("./guide-topics/[id]/route"),
		jsonBodyMethods: ["PUT"],
	},
	{
		path: "/api/admin/upload",
		load: () => import("./upload/route"),
		jsonBodyMethods: [],
	},
	{
		path: "/api/admin/revalidate",
		load: () => import("./revalidate/route"),
		jsonBodyMethods: ["POST"],
	},
	{
		path: "/api/admin/indexnow",
		load: () => import("./indexnow/route"),
		jsonBodyMethods: [],
	},
	{
		path: "/api/admin/keepalive",
		load: () => import("./keepalive/route"),
		jsonBodyMethods: [],
	},
]

/**
 * Each header alone must be enough to refuse a write, so a handler that checks
 * only one of them (its own check instead of `requireAdmin`) fails here.
 */
const CROSS_SITE_HEADER_SETS: Array<{
	label: string
	headers: Record<string, string>
}> = [
	{ label: "Sec-Fetch-Site only", headers: { "sec-fetch-site": "same-site" } },
	{ label: "Origin only", headers: { origin: "http://other.localhost" } },
]

beforeEach(() => {
	// The guard logs at error level on every rejection; these are all expected.
	vi.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
	// `restoreMocks` doesn't reset a `vi.fn()` factory's return value, so a test
	// that grants a session must not leak it into the next one, even on failure.
	vi.mocked(verifySession).mockResolvedValue(false)
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

describe.each(routeModules)("$path, cross-site", ({ load }) => {
	it.each(CROSS_SITE_HEADER_SETS)(
		"refuses every exported write handler sent cross-site ($label)",
		async ({ headers }) => {
			// With a valid session: the check runs after the session one, so a
			// handler that forwards a stand-in request instead of its own would
			// pass the 401 contract above and fail here.
			vi.mocked(verifySession).mockResolvedValue(true)
			vi.spyOn(console, "warn").mockImplementation(() => undefined)

			const routeModule = (await load()) as Record<string, Handler | undefined>
			const writes = HTTP_METHODS.filter(
				(method) =>
					method !== "GET" && typeof routeModule[method] === "function"
			)

			// Every admin module writes; a GET-only one would pass this with no
			// assertion at all, so it has to be noticed here.
			expect(writes.length).toBeGreaterThan(0)

			for (const method of writes) {
				const handler = routeModule[method] as Handler
				const request = new Request("http://localhost/api/admin/probe", {
					method,
					headers,
				})
				const response = await handler(request, {
					params: Promise.resolve({ id: "1" }),
				})

				expect(
					response.status,
					`${method} answered ${response.status} to a cross-site write`
				).toBe(403)
			}
		}
	)
})

describe.each(routeModules.filter((route) => route.jsonBodyMethods.length > 0))(
	"$path, content type",
	({ load, jsonBodyMethods }) => {
		it("refuses a same-origin JSON-shaped text/plain body with 415", async () => {
			// A handler that calls `request.json()` itself instead of
			// `parseJsonBody` would parse this body; the DB mock is empty, so it
			// then fails with anything but a 415.
			vi.mocked(verifySession).mockResolvedValue(true)
			vi.spyOn(console, "warn").mockImplementation(() => undefined)

			const routeModule = (await load()) as Record<string, Handler | undefined>

			for (const method of jsonBodyMethods) {
				const handler = routeModule[method]

				expect(handler, `${method} is not exported`).toBeTypeOf("function")

				const request = new Request("http://localhost/api/admin/probe", {
					method,
					headers: { "Content-Type": "text/plain" },
					body: "{}",
				})
				const response = await (handler as Handler)(request, {
					params: Promise.resolve({ id: "1" }),
				})

				expect(
					response.status,
					`${method} answered ${response.status} to a text/plain body`
				).toBe(415)
			}
		})
	}
)

describe("the route list", () => {
	it("covers every route module in the tree", () => {
		// Guards the "listed explicitly" decision above: if a new admin route
		// file appears and nobody adds it here, this fails instead of the new
		// route silently going unchecked. Every extension Next accepts for a
		// route file counts.
		const discovered = readdirSync(__dirname, {
			recursive: true,
			encoding: "utf8",
		})
			.filter((entry) => ROUTE_FILE.test(entry))
			.map((entry) => `/api/admin/${dirname(entry)}`.replace(/\/\.$/, ""))
			.sort()
		const listed = routeModules.map(({ path }) => path).sort()

		expect(discovered).toEqual(listed)
	})
})
