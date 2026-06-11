import { createHmac } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The login route builds its `Ratelimit` at module load from the env it reads
// then, so each test resets the module registry and re-imports under stubbed
// env (`loadRoute`). This file covers the Redis-present paths that
// `route.test.ts` can't reach — there `.env.test` sets no KV vars, so the
// limiter is null. Both KV vars are always stubbed here; `loadRoute`'s
// `ipHashSecret` arg selects the path: empty → global-bucket fallback, set →
// per-IP HMAC buckets.

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

const CLIENT_IP = "203.0.113.7"
const PER_IP_SECRET = "test-hmac-secret"

/**
 * Resets modules and re-imports the route with both KV vars present. The
 * `ipHashSecret` arg selects the path under test: empty (default) → global
 * bucket; non-empty → per-IP HMAC buckets.
 */
async function loadRoute({
	ipHashSecret = "",
}: { ipHashSecret?: string } = {}) {
	vi.resetModules()
	vi.stubEnv("KV_REST_API_TOKEN", "test-token")
	vi.stubEnv("KV_REST_API_URL", "https://test.upstash.io")
	vi.stubEnv("IP_HASH_SECRET", ipHashSecret)

	return import("./route")
}

/** Mirrors the route's `clientBucketKey` so tests can assert the exact key. */
function expectedKey(rawIp: string, secret = PER_IP_SECRET): string {
	return createHmac("sha256", secret)
		.update(rawIp)
		.digest("base64url")
		.slice(0, 22)
}

function makeRequest(
	body: unknown,
	{ forwardedFor = CLIENT_IP }: { forwardedFor?: string | null } = {}
) {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	}
	// `null` omits the header so the route's headerless "unknown" fallback is
	// exercisable; any string is sent verbatim (including proxy lists).
	if (forwardedFor !== null) {
		headers["x-forwarded-for"] = forwardedFor
	}

	return new Request("http://localhost/api/auth/login", {
		method: "POST",
		headers,
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

// #region Per-IP buckets (Redis set, IP_HASH_SECRET present)

describe("POST /api/auth/login — per-IP rate limiting", () => {
	it("does not warn about a missing secret when one is configured", async () => {
		await loadRoute({ ipHashSecret: PER_IP_SECRET })

		expect(vi.mocked(console.warn)).not.toHaveBeenCalledWith(
			"[api:auth:login] IP_HASH_SECRET not configured, rate limiting falls back to a global bucket"
		)
	})

	it("keys the limiter on the HMAC of the client IP, never the global bucket", async () => {
		limitMock.mockResolvedValue({ success: true })
		const { POST } = await loadRoute({ ipHashSecret: PER_IP_SECRET })

		await POST(
			makeRequest({ email: "admin@example.com", password: "wrong" }) as never
		)

		expect(limitMock).toHaveBeenCalledWith(expectedKey(CLIENT_IP))
		expect(limitMock).not.toHaveBeenCalledWith("global")
	})

	it("derives the key from the leftmost x-forwarded-for entry", async () => {
		limitMock.mockResolvedValue({ success: true })
		const { POST } = await loadRoute({ ipHashSecret: PER_IP_SECRET })

		await POST(
			makeRequest(
				{ email: "admin@example.com", password: "wrong" },
				{ forwardedFor: "198.51.100.4, 10.0.0.1, 10.0.0.2" }
			) as never
		)

		// Vercel appends proxy hops to the right; the original client is leftmost.
		expect(limitMock).toHaveBeenCalledWith(expectedKey("198.51.100.4"))
	})

	it("buckets requests with no forwarded header under a stable 'unknown' key", async () => {
		limitMock.mockResolvedValue({ success: true })
		const { POST } = await loadRoute({ ipHashSecret: PER_IP_SECRET })

		await POST(
			makeRequest(
				{ email: "admin@example.com", password: "wrong" },
				{ forwardedFor: null }
			) as never
		)

		// Headerless requests share one bucket keyed on the literal "unknown" so
		// they can't piggyback on a real client's budget — they aren't skipped.
		expect(limitMock).toHaveBeenCalledWith(expectedKey("unknown"))
	})

	it("gives different client IPs independent buckets", async () => {
		limitMock.mockResolvedValue({ success: true })
		const { POST } = await loadRoute({ ipHashSecret: PER_IP_SECRET })

		await POST(
			makeRequest(
				{ email: "admin@example.com", password: "wrong" },
				{ forwardedFor: "198.51.100.4" }
			) as never
		)
		await POST(
			makeRequest(
				{ email: "admin@example.com", password: "wrong" },
				{ forwardedFor: "203.0.113.9" }
			) as never
		)

		const keys = limitMock.mock.calls.map((call) => call[0])
		expect(keys).toEqual([
			expectedKey("198.51.100.4"),
			expectedKey("203.0.113.9"),
		])
		// Distinct IPs must never collide into one budget.
		expect(new Set(keys).size).toBe(2)
	})

	it("includes the pseudonymized bucket key in the invalid-credentials warn", async () => {
		limitMock.mockResolvedValue({ success: true })
		const { POST } = await loadRoute({ ipHashSecret: PER_IP_SECRET })

		await POST(
			makeRequest({ email: "admin@example.com", password: "wrong" }) as never
		)

		// With a secret set, the failure log carries the same hashed key as the
		// rate-limit log so the two correlate without ever logging a raw IP.
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:auth:login] invalid credentials",
			{ key: expectedKey(CLIENT_IP) }
		)
	})
})

// #endregion
