import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The login route builds its `Ratelimit` at module load from the env it reads
// then, so each test resets the module registry and re-imports under stubbed
// env (`loadRoute`). This file covers the Redis-present paths that
// `route.test.ts` can't reach — there `.env.test` sets no KV vars, so the
// limiter is null. Here both KV vars are stubbed and `IP_HASH_SECRET` is left
// empty to exercise the global-bucket fallback.

const { limitMock } = vi.hoisted(() => ({ limitMock: vi.fn() }))

vi.mock("@upstash/redis", () => ({
	// Plain class so `new Redis(...)` at module load constructs without touching
	// the network; the config object is never read by the mock. The instance
	// field keeps it a real class (eslint's no-extraneous-class).
	Redis: class {
		ready = true
	},
}))

vi.mock("@upstash/ratelimit", () => ({
	// Class for `new Ratelimit(...)`, with the static `slidingWindow` the route
	// calls at module load attached alongside it.
	Ratelimit: Object.assign(
		class {
			limit = limitMock
		},
		{ slidingWindow: () => ({}) }
	),
}))

vi.mock("@/lib/auth/auth", () => ({
	// Default to a failed credential check so a request that clears the limiter
	// lands on the 401 branch — enough to prove it got past rate limiting.
	verifyCredentials: vi.fn().mockResolvedValue(false),
	createSession: vi.fn(),
}))

/**
 * Resets modules and re-imports the route under KV vars present but
 * `IP_HASH_SECRET` empty, so the limiter runs against the global bucket.
 */
async function loadRoute() {
	vi.resetModules()
	vi.stubEnv("KV_REST_API_TOKEN", "test-token")
	vi.stubEnv("KV_REST_API_URL", "https://test.upstash.io")
	vi.stubEnv("IP_HASH_SECRET", "")

	return import("./route")
}

function makeRequest(body: unknown) {
	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			// Set so the assertions can prove the IP is ignored in global mode.
			"x-forwarded-for": "203.0.113.7",
		},
		body: JSON.stringify(body),
	})
}

beforeEach(() => {
	// Only the limiter's per-test behavior changes; `verifyCredentials` keeps the
	// factory default (resolves false) so a request that clears the limiter lands
	// on the 401 branch.
	limitMock.mockReset()
})

afterEach(() => {
	vi.unstubAllEnvs()
})

// #region Global-bucket fallback (Redis set, IP_HASH_SECRET missing)

describe("POST /api/auth/login — global-bucket rate limiting", () => {
	it("warns at module load that the limiter degraded to a global bucket", async () => {
		await loadRoute()

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:auth:login] IP_HASH_SECRET not configured, rate limiting falls back to a global bucket"
		)
	})

	it("keys the limiter on the constant global bucket, ignoring the client IP", async () => {
		limitMock.mockResolvedValue({ success: true })
		const { POST } = await loadRoute()

		await POST(
			makeRequest({ email: "admin@example.com", password: "wrong" }) as never
		)

		// The forwarded IP must not influence the key when no secret is set —
		// that's the whole point of the global bucket.
		expect(limitMock).toHaveBeenCalledWith("global")
	})

	it("returns 429 when the shared bucket is exhausted", async () => {
		limitMock.mockResolvedValue({ success: false })
		const { POST } = await loadRoute()

		const response = await POST(
			makeRequest({ email: "admin@example.com", password: "wrong" }) as never
		)

		expect(response.status).toBe(429)
		const data = await response.json()
		expect(data.error).toBe("Too many requests")
	})

	it("fails open to credential checking when the limiter throws", async () => {
		// A transient Upstash blip must not lock the admin out; the request should
		// fall through to the 401 from the (mocked-false) credential check.
		limitMock.mockRejectedValue(new Error("upstash down"))
		const { POST } = await loadRoute()

		const response = await POST(
			makeRequest({ email: "admin@example.com", password: "wrong" }) as never
		)

		expect(response.status).toBe(401)
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:auth:login] rate limit unavailable, failing open",
			expect.any(Error)
		)
	})
})

// #endregion
