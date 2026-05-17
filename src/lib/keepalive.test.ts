import { beforeEach, describe, expect, it, vi } from "vitest"
import { KEEPALIVE_KEY, writeKeepalive } from "./keepalive"
import type { Redis } from "@upstash/redis"

function fakeRedis(
	set: (key: string, value: string) => Promise<unknown>
): Redis {
	return { set } as unknown as Redis
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("writeKeepalive", () => {
	it("writes the KEEPALIVE_KEY with the current ISO timestamp and returns it on success", async () => {
		const setMock = vi.fn().mockResolvedValue("OK")
		const before = new Date().toISOString()

		const result = await writeKeepalive(fakeRedis(setMock))

		const after = new Date().toISOString()

		expect(setMock).toHaveBeenCalledOnce()
		expect(setMock.mock.calls[0][0]).toBe(KEEPALIVE_KEY)
		expect(result.ok).toBe(true)
		if (!result.ok) {
			throw new Error("unreachable")
		}
		// Returned `value` must match the value passed to `redis.set` and be a
		// valid ISO 8601 string between `before` and `after`.
		expect(result.value).toBe(setMock.mock.calls[0][1])
		expect(result.value >= before).toBe(true)
		expect(result.value <= after).toBe(true)
	})

	it("wraps a non-Error string throw in a real Error so `.message` is usable", async () => {
		// 2026-05-16 review: previously `error: unknown` forced every caller to
		// re-narrow. Helper now normalizes at the boundary via `new Error(String(error))`,
		// so a string rejection becomes an Error whose `.message` is the original
		// string (rather than the bare value, which `.message`-based logging
		// couldn't render at all).
		const setMock = vi.fn().mockRejectedValue("upstash unreachable")

		const result = await writeKeepalive(fakeRedis(setMock))

		expect(result.ok).toBe(false)
		if (result.ok) {
			throw new Error("unreachable")
		}
		expect(result.error).toBeInstanceOf(Error)
		expect(result.error.message).toBe("upstash unreachable")
	})

	it("wraps a non-Error object throw without crashing (degrades to `String(error)` semantics)", async () => {
		// Pins that a plain object throw doesn't propagate as `unknown` and
		// doesn't throw on the wrap. The `[object Object]` message is acceptable
		// — what matters is that the caller has an Error instance to hand to
		// `console.error` without re-narrowing.
		const setMock = vi.fn().mockRejectedValue({ code: "NETWORK" })

		const result = await writeKeepalive(fakeRedis(setMock))

		expect(result.ok).toBe(false)
		if (result.ok) {
			throw new Error("unreachable")
		}
		expect(result.error).toBeInstanceOf(Error)
	})

	it("preserves a real Error instance verbatim on rejection (stack and identity intact)", async () => {
		const original = new Error("upstash down")
		const setMock = vi.fn().mockRejectedValue(original)

		const result = await writeKeepalive(fakeRedis(setMock))

		expect(result.ok).toBe(false)
		if (result.ok) {
			throw new Error("unreachable")
		}
		expect(result.error).toBe(original)
	})
})
