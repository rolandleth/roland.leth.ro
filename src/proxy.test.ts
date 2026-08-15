import { jwtVerify } from "jose"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { config, proxy } from "@/proxy"
import { TEST_SECRET } from "@/test/fixtures"

vi.mock("jose", () => ({
	jwtVerify: vi.fn(),
}))

function makeRequest(
	path: string,
	sessionToken?: string,
	method = "GET"
): NextRequest {
	const headers = new Headers()

	if (sessionToken != null) {
		headers.set("Cookie", `session=${sessionToken}`)
	}

	return new NextRequest(`http://localhost${path}`, { headers, method })
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

	it("does not treat /admin-notes as an admin page (adjacent prefix)", async () => {
		// The gate is boundary-matched (`=== "/admin"` or `/admin/`), mirroring
		// `isAdminApi`. A slug that merely starts with the literal "admin" must
		// fall through instead of redirecting to login.
		const response = await proxy(makeRequest("/admin-notes"))
		expect(response.headers.get("location")).toBeNull()
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	it("gates a case-variant admin page path (defense in depth)", async () => {
		// Next.js routing is case-sensitive so `/ADMIN` 404s anyway, but the gate
		// lower-cases before matching so an uppercase variant can only ever be MORE
		// protected, never less — closing the asymmetry with the bot-probe filter.
		const response = await proxy(makeRequest("/ADMIN/posts"))
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

	it("allows authenticated /api/admin/ requests through", async () => {
		vi.mocked(jwtVerify).mockResolvedValue({
			payload: { admin: true },
		} as never)
		const response = await proxy(makeRequest("/api/admin/posts", "valid-token"))
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
		"/api/admin",
		"/api/admin/posts",
		"/api/admin/posts/1",
		"/api/admin/projects",
		"/api/admin/projects/1",
		"/api/admin/upload",
		"/api/admin/revalidate",
		// Gating matters more here than on its siblings: this one's side effect is
		// outbound traffic to a third party under the site's own identity, plus
		// disclosure of the full URL list.
		"/api/admin/indexnow",
	])("returns 401 for unauthenticated %s", async (path) => {
		const response = await proxy(makeRequest(path))
		expect(response.status).toBe(401)
	})

	it("does not block /api/adminx (adjacent prefix, not a protected path)", async () => {
		// Guards against the equality check being accidentally widened to startsWith.
		const response = await proxy(makeRequest("/api/adminx"))
		expect(response.headers.get("x-middleware-next")).toBe("1")
	})

	// The gate must be method-agnostic: a mutating verb without a session is the
	// exact request it exists to stop. Pins that a future method-conditional
	// branch can't open a write hole.
	it.each(["POST", "PUT", "DELETE", "PATCH"])(
		"returns 401 for an unauthenticated %s to /api/admin/posts",
		async (method) => {
			const response = await proxy(
				makeRequest("/api/admin/posts", undefined, method)
			)
			expect(response.status).toBe(401)
		}
	)

	it("gates a case-variant admin API path (defense in depth)", async () => {
		const response = await proxy(makeRequest("/API/ADMIN/posts"))
		expect(response.status).toBe(401)
	})
})

// #endregion

// #region Bot probe short-circuit

// Only admin-shaped probes are covered here. The matcher now admits nothing but
// the two admin namespaces, so a probe like `/wp-login.php` never reaches this
// function — it resolves to the static 404 with no compute. The extension and
// path-prefix lists themselves are covered in `lib/proxy/botProbes.test.ts`.
describe("proxy — bot probe short-circuit", () => {
	// The probe filter runs BEFORE the auth gate, so a probe aimed at the admin
	// namespace 404s (cheap, no auth work) rather than triggering an auth check
	// and a login redirect / 401. Pins that ordering explicitly.
	it.each([
		"/admin/wp-login.php",
		"/admin/config.php",
		"/api/admin/shell.php",
		"/api/admin/backup.sql",
	])(
		"404s the admin-shaped probe %s before the auth gate runs",
		async (path) => {
			const response = await proxy(makeRequest(path))
			expect(response.status).toBe(404)
			expect(response.headers.get("x-middleware-next")).toBeNull()
		}
	)

	it("sends a nested dotfile probe to the auth gate, not the 404", async () => {
		// `BOT_PROBE_PATH_PREFIXES` is anchored at the path root, so `/admin/.env`
		// isn't a prefix match, and the extension check deliberately skips
		// leading-dot segments. It reaches the gate and redirects to login, which
		// exposes nothing — documented here so the difference from `/.env` reads
		// as intended rather than as a hole.
		const response = await proxy(makeRequest("/admin/.env"))
		expect(response.status).toBe(307)
		expect(response.headers.get("location")).toContain("/admin/login")
	})

	it.each(["/admin", "/admin/posts/new", "/api/admin/posts/1"])(
		"does not 404 the real admin path %s",
		async (path) => {
			// A false positive here would lock the admin out of its own dashboard,
			// so the filter must stay narrow enough to leave real paths alone.
			const response = await proxy(makeRequest(path))
			expect(response.status).not.toBe(404)
		}
	)
})

// #endregion

// #region Empty cookie edge cases

describe("proxy — empty session cookie", () => {
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

// #region Matcher coverage

/**
 * Every other test in this file calls `proxy()` directly, which assumes the
 * request reached the middleware at all. That assumption is exactly what the
 * matcher decides, so these tests cover that blind spot from the other side.
 */
describe("config.matcher", () => {
	it.each(["/admin", "/admin/:path*", "/api/admin", "/api/admin/:path*"])(
		"matches %s explicitly",
		(entry) => {
			expect(config.matcher).toContain(entry)
		}
	)

	it("admits nothing outside the two admin namespaces", () => {
		// The 2026-07-26 bypass came from a broad negative-lookahead pattern whose
		// unanchored extension group let `/api/admin/posts/1.json` skip the gate.
		// An explicit namespace list can't fail that way — this pins that no
		// catch-all entry creeps back in, which would also put every public page
		// view back on a billed invocation.
		for (const entry of config.matcher) {
			expect(entry.startsWith("/admin") || entry.startsWith("/api/admin")).toBe(
				true
			)
		}
	})

	it("has no more entries than the four gated namespaces", () => {
		expect(config.matcher).toHaveLength(4)
	})
})

// #endregion
