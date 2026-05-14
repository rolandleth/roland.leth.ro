import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { KEEPALIVE_KEY } from "@/lib/keepalive"
import { GET } from "./route"

// `hasRedis` in the route is evaluated at module-load from
// `process.env.KV_REST_API_TOKEN`. `.env.test` leaves it unset, so `redis` is
// null here and these tests exercise the auth guards + the no-Redis happy path.
// The redis.set error branch is exercised in a separate describe block that
// resets the module with the env var set.

function makeRequest(authorization?: string): NextRequest {
	const headers = new Headers()

	if (authorization !== undefined) {
		headers.set("authorization", authorization)
	}

	return new NextRequest("http://localhost/api/cron/ping", { headers })
}

beforeEach(() => {
	vi.stubEnv("CRON_SECRET", "test-secret")
})

afterEach(() => {
	vi.unstubAllEnvs()
})

// #region Auth guard

describe("GET /api/cron/ping — auth guard", () => {
	it("returns 401 (not 500) when CRON_SECRET is not configured, without naming the env var", async () => {
		// Pre-auth probes must not learn the server is missing CRON_SECRET;
		// the previous 500 body `{ error: "CRON_SECRET not configured" }`
		// leaked the env-var name to any unauthenticated caller. The
		// server-side log stays at error level so a Vercel deploy regression
		// is still visible.
		vi.stubEnv("CRON_SECRET", "")

		const response = await GET(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(401)
		const data = await response.json()
		expect(data.error).toBe("Unauthorized")
		expect(JSON.stringify(data)).not.toMatch(/CRON_SECRET/)
		expect(vi.mocked(console.error)).toHaveBeenCalledWith(
			"[api:cron:ping] CRON_SECRET not configured"
		)
	})

	it("returns 401 when the authorization header is missing", async () => {
		const response = await GET(makeRequest())

		expect(response.status).toBe(401)
	})

	it("returns 401 when the authorization header doesn't match the bearer secret", async () => {
		const response = await GET(makeRequest("Bearer wrong-secret"))

		expect(response.status).toBe(401)
	})

	it("returns 401 when the Bearer prefix is missing", async () => {
		// Ensures a typo swapping `Bearer ` for `Token ` is caught.
		const response = await GET(makeRequest("test-secret"))

		expect(response.status).toBe(401)
	})

	it("logs unauthorized attempts at warn level (not error)", async () => {
		// Routine bot scans should not dominate the error log. Demoting to warn
		// keeps the signal visible without burying credential-misconfig errors
		// (which stay at error level).
		await GET(makeRequest("Bearer wrong-secret"))

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:cron:ping] unauthorized"
		)
		expect(vi.mocked(console.error)).not.toHaveBeenCalled()
	})
})

// #endregion

// #region No-Redis happy path

describe("GET /api/cron/ping — no Redis configured", () => {
	it("returns 200 with ok:true when auth is valid but Redis is not configured", async () => {
		const response = await GET(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)
	})
})

// #endregion

// #region Redis path (module reset with env var set)

describe("GET /api/cron/ping — Redis configured", () => {
	const originalKV = process.env.KV_REST_API_TOKEN
	const originalKVUrl = process.env.KV_REST_API_URL

	beforeEach(() => {
		process.env.KV_REST_API_TOKEN = "stub-token"
		process.env.KV_REST_API_URL = "https://stub.upstash.io"
	})

	afterEach(() => {
		vi.doUnmock("@upstash/redis")

		if (originalKV === undefined) {
			delete process.env.KV_REST_API_TOKEN
		} else {
			process.env.KV_REST_API_TOKEN = originalKV
		}

		if (originalKVUrl === undefined) {
			delete process.env.KV_REST_API_URL
		} else {
			process.env.KV_REST_API_URL = originalKVUrl
		}
	})

	it("returns 200 and writes keepalive:last when redis.set succeeds", async () => {
		vi.resetModules()
		const setSpy = vi.fn().mockResolvedValue("OK")
		vi.doMock("@upstash/redis", () => ({
			Redis: class {
				set = setSpy
			},
		}))

		const { GET: GETReloaded } = await import("./route")
		const response = await GETReloaded(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)

		// Asserts the route writes the dedicated keepalive key with an ISO
		// timestamp value — guards against a regression to `ping()` (which
		// Upstash excludes from idle-database detection).
		expect(setSpy).toHaveBeenCalledTimes(1)
		const [key, value] = setSpy.mock.calls[0]
		expect(key).toBe(KEEPALIVE_KEY)
		expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
	})

	it("returns 502 when redis.set rejects", async () => {
		vi.resetModules()
		vi.doMock("@upstash/redis", () => ({
			Redis: class {
				set = vi.fn().mockRejectedValue(new Error("Redis down"))
			},
		}))

		const { GET: GETReloaded } = await import("./route")
		const response = await GETReloaded(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(502)
		const data = await response.json()
		expect(data.error).toMatch(/Redis keepalive failed/)
	})
})

// #endregion
