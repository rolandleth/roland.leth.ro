import { jwtVerify } from "jose"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { proxy } from "@/proxy"
import { TEST_SECRET } from "@/test/fixtures"

vi.mock("jose", () => ({
	jwtVerify: vi.fn(),
}))

function makeRequest(path: string, sessionToken?: string): NextRequest {
	const headers = new Headers()

	if (sessionToken != null) {
		headers.set("Cookie", `session=${sessionToken}`)
	}

	return new NextRequest(`http://localhost${path}`, { headers })
}

beforeEach(() => {
	// Real `auth.ts` throws if SESSION_SECRET is unset. Use a deterministic hex
	// secret (length satisfies jose's HS256 minimum) so every test starts signed.
	vi.stubEnv("SESSION_SECRET", TEST_SECRET.padEnd(32, "0"))
})

// #region Admin page protection

describe("proxy — admin page protection", () => {
	it("redirects unauthenticated requests to /admin to /admin/login", async () => {
		const response = await proxy(makeRequest("/admin"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})

	it("redirects unauthenticated requests to nested admin routes to /admin/login", async () => {
		const response = await proxy(makeRequest("/admin/posts/new"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})

	it("allows /admin/login through without authentication", async () => {
		const response = await proxy(makeRequest("/admin/login"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("allows authenticated requests to /admin through", async () => {
		vi.mocked(jwtVerify).mockResolvedValue({
			payload: { admin: true },
		} as never)
		const response = await proxy(makeRequest("/admin", "valid-token"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("redirects to /admin/login when the session token is invalid", async () => {
		vi.mocked(jwtVerify).mockRejectedValue(new Error("Invalid token"))
		const response = await proxy(makeRequest("/admin", "bad-token"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})

	it("surfaces the error when SESSION_SECRET is missing and a token is present", async () => {
		// Deleting the env var makes `getSessionSecret()` throw; the proxy's
		// `await isAuthenticated(...)` rejects with that error. The contract is:
		// missing secret is a deployment fault and must not silently pass auth.
		delete process.env.SESSION_SECRET
		await expect(proxy(makeRequest("/admin", "some-token"))).rejects.toThrow(
			/SESSION_SECRET/
		)
	})

	it("redirects unauthenticated requests to /admin/login with no cookie even if SESSION_SECRET is missing", async () => {
		// No cookie → isAuthenticated short-circuits before reading the secret,
		// so the redirect path still works without env setup.
		delete process.env.SESSION_SECRET
		const response = await proxy(makeRequest("/admin"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})
})

// #endregion

// #region Admin API protection

describe("proxy — admin API protection", () => {
	it("returns 401 for unauthenticated /api/admin/ requests", async () => {
		const response = await proxy(makeRequest("/api/admin/posts"))
		expect(response.status).toBe(401)
	})

	it("returns 401 for unauthenticated /api/upload requests", async () => {
		const response = await proxy(makeRequest("/api/upload"))
		expect(response.status).toBe(401)
	})

	it("allows authenticated /api/admin/ requests through", async () => {
		vi.mocked(jwtVerify).mockResolvedValue({
			payload: { admin: true },
		} as never)
		const response = await proxy(makeRequest("/api/admin/posts", "valid-token"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("allows authenticated /api/upload requests through", async () => {
		vi.mocked(jwtVerify).mockResolvedValue({
			payload: { admin: true },
		} as never)
		const response = await proxy(makeRequest("/api/upload", "valid-token"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("rejects a valid-signed token that lacks the admin claim", async () => {
		// A signature-only check would let any JWT signed with SESSION_SECRET pass
		// — including ones minted by an unrelated flow. The admin-claim guard keeps
		// auth scoped to tokens this app actually issues.
		vi.mocked(jwtVerify).mockResolvedValue({
			payload: { role: "guest" },
		} as never)
		const response = await proxy(makeRequest("/api/admin/posts", "valid-token"))
		expect(response.status).toBe(401)
	})

	// Contract test: every admin API path — both collection and resource —
	// must be gated by middleware. A new admin route that bypasses the matcher
	// would be a silent auth regression; asserting each path here is the
	// minimum backstop since the handlers themselves don't re-check sessions.
	it.each([
		"/api/admin/posts",
		"/api/admin/posts/1",
		"/api/admin/projects",
		"/api/admin/projects/1",
		"/api/upload",
	])("returns 401 for unauthenticated %s", async (path) => {
		const response = await proxy(makeRequest(path))
		expect(response.status).toBe(401)
	})
})

// #endregion

// #region Legacy redirects — section blog

describe("proxy — section blog redirects", () => {
	it("redirects /tech/blog/:slug to /blog/tech/:slug", async () => {
		const response = await proxy(makeRequest("/tech/blog/my-post"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/tech/my-post")
	})

	it("redirects /life/blog/:slug to /blog/life/:slug", async () => {
		const response = await proxy(makeRequest("/life/blog/some-post"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/life/some-post")
	})

	it("preserves the full slug when it contains hyphens", async () => {
		const response = await proxy(makeRequest("/tech/blog/my-long-post-title"))
		expect(response.headers.get("location")).toContain(
			"/blog/tech/my-long-post-title"
		)
	})
})

// #endregion

// #region Legacy redirects — archive

describe("proxy — archive redirects", () => {
	it("redirects /tech/archive to /blog/tech/archive", async () => {
		const response = await proxy(makeRequest("/tech/archive"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/tech/archive")
	})

	it("redirects /life/archive to /blog/life/archive", async () => {
		const response = await proxy(makeRequest("/life/archive"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/life/archive")
	})
})

// #endregion

// #region Legacy redirects — search

describe("proxy — search redirects", () => {
	it("redirects /tech/search to /blog/tech/search", async () => {
		const response = await proxy(makeRequest("/tech/search"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/tech/search")
	})

	it("redirects /life/search to /blog/life/search", async () => {
		const response = await proxy(makeRequest("/life/search"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/life/search")
	})
})

// #endregion

// #region Legacy redirects — section root

describe("proxy — section root redirects", () => {
	it("redirects /tech to /blog/tech", async () => {
		const response = await proxy(makeRequest("/tech"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/tech")
	})

	it("redirects /life to /blog/life", async () => {
		const response = await proxy(makeRequest("/life"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/life")
	})
})

// #endregion

// #region Legacy redirects — feeds

describe("proxy — feed redirects", () => {
	it("redirects /tech/feed to /api/feed/tech", async () => {
		const response = await proxy(makeRequest("/tech/feed"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/api/feed/tech")
	})

	it("redirects /feed to /api/feed/tech", async () => {
		const response = await proxy(makeRequest("/feed"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/api/feed/tech")
	})

	it("redirects /life/feed to /api/feed/life", async () => {
		const response = await proxy(makeRequest("/life/feed"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/api/feed/life")
	})
})

// #endregion

// #region Legacy redirects — privacy policy

describe("proxy — privacy policy redirect", () => {
	it("redirects /privacy-policy to /privacy", async () => {
		const response = await proxy(makeRequest("/privacy-policy"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/privacy")
	})
})

// #endregion

// #region Root slug fall-through

describe("proxy — root slug fall-through", () => {
	it("passes unknown single-segment paths through to Next.js routing", async () => {
		// Legacy slugs are handled by `src/app/[slug]/page.tsx`, not by
		// middleware rewrite — so middleware just falls through.
		const response = await proxy(makeRequest("/some-old-post"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.headers.get("x-middleware-rewrite")).toBeNull()
	})

	it.each(["/about", "/projects", "/blog", "/api", "/privacy", "/tools"])(
		"passes known top-level route %s through",
		async (path) => {
			const response = await proxy(makeRequest(path))
			expect(response.headers.get("x-middleware-rewrite")).toBeNull()
			expect(response.headers.get("x-middleware-next")).toBe("1")
		}
	)
})

// #endregion

// #region Pass-through

describe("proxy — pass-through", () => {
	it("passes through the home page", async () => {
		const response = await proxy(makeRequest("/"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through /about", async () => {
		const response = await proxy(makeRequest("/about"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through /blog/:section/:slug routes", async () => {
		const response = await proxy(makeRequest("/blog/tech/my-post"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through /projects", async () => {
		const response = await proxy(makeRequest("/projects"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through /api routes that are not admin-protected", async () => {
		const response = await proxy(makeRequest("/api/feed/tech"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through multi-segment paths that are not legacy patterns", async () => {
		const response = await proxy(makeRequest("/blog/tech/archive"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through /api/admin without a trailing slash (boundary)", async () => {
		// `startsWith("/api/admin/")` requires the trailing slash, so the bare
		// path falls through to the generic /api pass-through, not admin auth.
		const response = await proxy(makeRequest("/api/admin"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})
})

// #endregion

// #region Trailing slash + empty cookie edge cases

describe("proxy — trailing slash variants and empty cookie", () => {
	it("passes /tech/ (trailing slash) through to Next.js", async () => {
		// SECTION_ROOT_REGEX is anchored with `$` after the section name, so
		// `/tech/` misses it. With KNOWN_ROUTES gone, middleware no longer
		// rewrites to an API handler; Next.js normalizes the trailing slash
		// and dispatches to `src/app/[slug]/page.tsx` if nothing static matches.
		const response = await proxy(makeRequest("/tech/"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.headers.get("x-middleware-rewrite")).toBeNull()
	})

	it("passes /life/blog/ (empty slug) through", async () => {
		// SECTION_BLOG_REGEX requires `(.+)` after `/blog/`, so `/life/blog/` misses it
		// and falls through to pass-through as a multi-segment non-legacy path.
		const response = await proxy(makeRequest("/life/blog/"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.headers.get("x-middleware-rewrite")).toBeNull()
	})

	it("redirects an /admin request with an empty session cookie to /admin/login", async () => {
		// An empty-string cookie value is falsy, so isAuthenticated short-circuits
		// the same way as a missing cookie.
		const response = await proxy(makeRequest("/admin", ""))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})

	it("returns 401 for an /api/admin request with an empty session cookie", async () => {
		const response = await proxy(makeRequest("/api/admin/posts", ""))
		expect(response.status).toBe(401)
	})
})

// #endregion

// #region Middleware short-circuits

describe("proxy — short-circuit paths", () => {
	it("passes through /_next/ paths without running auth or redirect logic", async () => {
		// `_next/` is excluded by `config.matcher` in production, but the defensive
		// early return inside `proxy()` keeps the function safe if that matcher
		// changes.
		const response = await proxy(makeRequest("/_next/data/build/foo.json"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("passes through paths containing a dot (static-asset-shaped URLs)", async () => {
		// The `config.matcher` is the primary asset filter; the proxy no longer
		// short-circuits on dots because that also dropped legacy dotted slugs
		// (e.g. `v1.2.3`, `node.js`) out of the redirect path. Anything with a
		// dot that actually reaches the proxy falls through unchanged.
		const response = await proxy(makeRequest("/favicon.ico"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("redirects a legacy dotted slug like /tech/blog/node.js", async () => {
		const response = await proxy(makeRequest("/tech/blog/node.js"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain("/blog/tech/node.js")
	})

	it("passes through /api/cron/ping without admin auth", async () => {
		// Cron endpoints authenticate via Bearer token in the handler, not via
		// the proxy's admin gate. A regression that rolled them into the admin
		// gate would break the cron workflow.
		const response = await proxy(makeRequest("/api/cron/ping"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.status).not.toBe(401)
	})
})

// #endregion

// #region Case sensitivity

describe("proxy — case sensitivity", () => {
	it("does not redirect /Tech/blog/:slug (section regex is lowercase)", async () => {
		// Section regexes use `SECTIONS` values verbatim. Uppercase variants fall
		// through so backlinks that were originally lowercase stay canonical;
		// anything else would produce two different canonical URLs for the same
		// post.
		const response = await proxy(makeRequest("/Tech/blog/my-post"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.headers.get("location")).toBeNull()
	})

	it("does not redirect /TECH/archive", async () => {
		const response = await proxy(makeRequest("/TECH/archive"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.headers.get("location")).toBeNull()
	})
})

// #endregion

// #region Query-string preservation

describe("proxy — query-string preservation on redirects", () => {
	it("preserves query strings on /tech/blog/:slug redirects", async () => {
		// Analytics links (e.g. `?ref=twitter`) should survive the legacy
		// redirect so the landing analytics stay attributed.
		const response = await proxy(makeRequest("/tech/blog/my-post?ref=twitter"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain(
			"/blog/tech/my-post?ref=twitter"
		)
	})

	it("preserves query strings on /tech/archive redirects", async () => {
		const response = await proxy(makeRequest("/tech/archive?page=2"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain(
			"/blog/tech/archive?page=2"
		)
	})

	it("preserves query strings on /tech/search redirects", async () => {
		const response = await proxy(makeRequest("/tech/search?q=react"))
		expect(response.status).toBe(301)
		expect(response.headers.get("location")).toContain(
			"/blog/tech/search?q=react"
		)
	})
})

// #endregion

// #region /api/upload boundary

describe("proxy — /api/upload boundary", () => {
	it("gates /api/upload itself behind admin auth", async () => {
		const response = await proxy(makeRequest("/api/upload"))
		expect(response.status).toBe(401)
	})

	it("does not gate /api/upload/<sub-path> (handler check is exact match)", async () => {
		// `proxy.ts` matches /api/upload with `===`, so sub-paths fall through
		// the admin gate. There is no actual /api/upload/* route today — this
		// test pins the current contract so a future sub-route addition is an
		// explicit decision, not a silent bypass.
		const response = await proxy(makeRequest("/api/upload/sub-path"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
		expect(response.status).not.toBe(401)
	})
})

// #endregion
