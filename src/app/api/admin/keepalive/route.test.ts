import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { KEEPALIVE_KEY } from "@/lib/api/keepalive"
import { POST } from "./route"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

// `redis` in the route is evaluated at module-load from
// `process.env.KV_REST_API_TOKEN`/`_URL`. `.env.test` leaves them unset, so
// `redis` is null here and these tests exercise the no-Redis 503 path. The
// Redis-configured path is exercised in a separate describe block that resets
// the module with both env vars set, mirroring the cron route's test setup.

describe("POST /api/admin/keepalive — no Redis configured", () => {
	it("returns 503 when Redis env vars are unset", async () => {
		const response = await POST()

		expect(response.status).toBe(503)
		const data = await response.json()
		expect(data.error).toMatch(/Redis is not configured/)
	})
})

describe("POST /api/admin/keepalive — Redis configured", () => {
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

	it("writes keepalive:last and returns 200 with the value", async () => {
		vi.resetModules()
		const setSpy = vi.fn().mockResolvedValue("OK")
		vi.doMock("@upstash/redis", () => ({
			Redis: class {
				set = setSpy
			},
		}))

		const { POST: POSTReloaded } = await import("./route")
		const response = await POSTReloaded()

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.ok).toBe(true)
		expect(data.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)

		// Guards against a regression that swaps the key constant; the
		// dashboard button and the cron must write the same key or the
		// "did this work" verification stops being meaningful.
		expect(setSpy).toHaveBeenCalledTimes(1)
		const [key, value] = setSpy.mock.calls[0]
		expect(key).toBe(KEEPALIVE_KEY)
		expect(value).toBe(data.value)
	})

	it("returns 502 when redis.set rejects", async () => {
		vi.resetModules()
		vi.doMock("@upstash/redis", () => ({
			Redis: class {
				set = vi.fn().mockRejectedValue(new Error("Redis down"))
			},
		}))

		const { POST: POSTReloaded } = await import("./route")
		const response = await POSTReloaded()

		expect(response.status).toBe(502)
		const data = await response.json()
		expect(data.error).toMatch(/Redis keepalive failed/)
	})
})
