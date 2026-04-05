import { jwtVerify } from "jose"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { proxy } from "@/proxy"

vi.mock("jose", () => ({
	jwtVerify: vi.fn(),
}))

const TEST_SECRET = "test-secret-at-least-32-characters-long"

function makeRequest(path: string, sessionToken?: string): NextRequest {
	const headers = new Headers()

	if (sessionToken) {
		headers.set("Cookie", `session=${sessionToken}`)
	}

	return new NextRequest(`http://localhost${path}`, { headers })
}

beforeEach(() => {
	vi.stubEnv("SESSION_SECRET", TEST_SECRET)
})

// ---------------------------------------------------------------------------
// Admin page protection
// ---------------------------------------------------------------------------

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
		vi.mocked(jwtVerify).mockResolvedValue({} as never)
		const response = await proxy(makeRequest("/admin", "valid-token"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("redirects to /admin/login when the session token is invalid", async () => {
		vi.mocked(jwtVerify).mockRejectedValue(new Error("Invalid token"))
		const response = await proxy(makeRequest("/admin", "bad-token"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})

	it("redirects to /admin/login when SESSION_SECRET is missing", async () => {
		delete process.env.SESSION_SECRET
		// getSecret() throws, caught inside isAuthenticated → returns false
		const response = await proxy(makeRequest("/admin", "some-token"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})
})

// ---------------------------------------------------------------------------
// Admin API protection
// ---------------------------------------------------------------------------

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
		vi.mocked(jwtVerify).mockResolvedValue({} as never)
		const response = await proxy(makeRequest("/api/admin/posts", "valid-token"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("allows authenticated /api/upload requests through", async () => {
		vi.mocked(jwtVerify).mockResolvedValue({} as never)
		const response = await proxy(makeRequest("/api/upload", "valid-token"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})
})

// ---------------------------------------------------------------------------
// Legacy redirects — section blog
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Legacy redirects — archive
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Legacy redirects — search
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Legacy redirects — section root
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Legacy redirects — feeds
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Root slug rewrite
// ---------------------------------------------------------------------------

describe("proxy — root slug rewrite", () => {
	it("rewrites an unknown single-segment path to /api/legacy-redirect/:slug", async () => {
		const response = await proxy(makeRequest("/some-old-post"))
		expect(response.headers.get("x-middleware-rewrite")).toContain(
			"/api/legacy-redirect/some-old-post"
		)
	})

	it("does not rewrite known top-level routes", async () => {
		// /admin is excluded: it redirects to /admin/login when unauthenticated,
		// so x-middleware-rewrite would be null for the wrong reason.
		const knownRoutes = ["/about", "/projects", "/blog", "/api"]

		for (const path of knownRoutes) {
			const response = await proxy(makeRequest(path))
			expect(response.headers.get("x-middleware-rewrite")).toBeNull()
			expect(response.headers.get("x-middleware-next")).toBe("1")
		}
	})
})

// ---------------------------------------------------------------------------
// Pass-through
// ---------------------------------------------------------------------------

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
})
