import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "./route"

// `hasRedis` in the route is evaluated at module-load from
// `process.env.KV_REST_API_TOKEN`. `.env.test` leaves it unset, so `redis` is
// null here and these tests exercise the auth guards + the no-Redis happy path.
// The redis.ping error branch is exercised in a separate describe block that
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
	it("returns 500 when CRON_SECRET is not configured", async () => {
		vi.stubEnv("CRON_SECRET", "")

		const response = await GET(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(500)
		const data = await response.json()
		expect(data.error).toMatch(/CRON_SECRET/)
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

	it("returns 200 when redis.ping succeeds", async () => {
		vi.resetModules()
		vi.doMock("@upstash/redis", () => ({
			Redis: {
				fromEnv: () => ({ ping: vi.fn().mockResolvedValue("PONG") }),
			},
		}))

		const { GET: GETReloaded } = await import("./route")
		const response = await GETReloaded(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)

		vi.doUnmock("@upstash/redis")
	})

	it("returns 502 when redis.ping rejects", async () => {
		vi.resetModules()
		vi.doMock("@upstash/redis", () => ({
			Redis: {
				fromEnv: () => ({
					ping: vi.fn().mockRejectedValue(new Error("Redis down")),
				}),
			},
		}))

		const { GET: GETReloaded } = await import("./route")
		const response = await GETReloaded(makeRequest("Bearer test-secret"))

		expect(response.status).toBe(502)
		const data = await response.json()
		expect(data.error).toMatch(/Redis ping failed/)

		vi.doUnmock("@upstash/redis")
	})
})

// #endregion
