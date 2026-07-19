import { describe, expect, it, vi } from "vitest"
import {
	buildIndexNowPayload,
	chunkUrls,
	findForeignHostUrls,
	INDEXNOW_ENDPOINT,
	isSubmittableOrigin,
	submitToIndexNow,
} from "@/lib/content/indexnow"

/** A fetch stub that returns a fixed status/body and records its calls. */
function fetchStub(status: number, body = "") {
	return vi.fn(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response(body, { status })
	)
}

// #region isSubmittableOrigin

describe("isSubmittableOrigin", () => {
	it("accepts an https public origin", () => {
		expect(isSubmittableOrigin("https://roland.leth.ro")).toBe(true)
	})

	it("rejects http", () => {
		// A public host on http is exactly what must be rejected; localhost is
		// exempt from the rule and would also fail the loopback check, muddying it.
		// eslint-disable-next-line sonarjs/no-clear-text-protocols
		expect(isSubmittableOrigin("http://roland.leth.ro")).toBe(false)
	})

	it("rejects localhost and loopback", () => {
		expect(isSubmittableOrigin("https://localhost:3000")).toBe(false)
		expect(isSubmittableOrigin("https://app.localhost")).toBe(false)
		expect(isSubmittableOrigin("https://127.0.0.1")).toBe(false)
	})

	it("rejects a bare (dotless) host", () => {
		expect(isSubmittableOrigin("https://intranet")).toBe(false)
	})

	it("rejects a malformed origin", () => {
		expect(isSubmittableOrigin("not a url")).toBe(false)
	})
})

// #endregion

// #region findForeignHostUrls

describe("findForeignHostUrls", () => {
	it("returns nothing when every URL is on-host", () => {
		const urls = [
			"https://roland.leth.ro/",
			"https://roland.leth.ro/blog/tech/a",
		]
		expect(findForeignHostUrls("roland.leth.ro", urls)).toEqual([])
	})

	it("flags off-host and malformed URLs", () => {
		const urls = [
			"https://roland.leth.ro/ok",
			"https://evil.com/x",
			"not a url",
		]
		expect(findForeignHostUrls("roland.leth.ro", urls)).toEqual([
			"https://evil.com/x",
			"not a url",
		])
	})

	it("compares hosts case-insensitively", () => {
		expect(
			findForeignHostUrls("roland.leth.ro", ["https://Roland.Leth.RO/x"])
		).toEqual([])
	})
})

// #endregion

// #region chunkUrls

describe("chunkUrls", () => {
	it("splits into batches no larger than size", () => {
		expect(chunkUrls(["a", "b", "c", "d", "e"], 2)).toEqual([
			["a", "b"],
			["c", "d"],
			["e"],
		])
	})

	it("returns a single batch when under the size", () => {
		expect(chunkUrls(["a", "b"], 10)).toEqual([["a", "b"]])
	})

	it("returns nothing for an empty list", () => {
		expect(chunkUrls([])).toEqual([])
	})
})

// #endregion

// #region buildIndexNowPayload

describe("buildIndexNowPayload", () => {
	it("assembles the IndexNow body", () => {
		expect(
			buildIndexNowPayload(
				"roland.leth.ro",
				"the-key",
				"https://roland.leth.ro/indexnow-key.txt",
				["https://roland.leth.ro/a"]
			)
		).toEqual({
			host: "roland.leth.ro",
			key: "the-key",
			keyLocation: "https://roland.leth.ro/indexnow-key.txt",
			urlList: ["https://roland.leth.ro/a"],
		})
	})
})

// #endregion

// #region submitToIndexNow

describe("submitToIndexNow", () => {
	const base = {
		key: "the-key",
		keyLocation: "https://roland.leth.ro/indexnow-key.txt",
		host: "roland.leth.ro",
		urls: ["https://roland.leth.ro/a", "https://roland.leth.ro/b"],
	}

	it("POSTs the payload to the endpoint and reports success on 200", async () => {
		const fetchImpl = fetchStub(200)

		const result = await submitToIndexNow({ ...base, fetchImpl })

		expect(result.ok).toBe(true)
		expect(result.submitted).toBe(2)
		expect(result.batches).toHaveLength(1)
		expect(result.batches[0]).toMatchObject({ status: 200, ok: true, count: 2 })

		expect(fetchImpl).toHaveBeenCalledTimes(1)
		const [url, init] = fetchImpl.mock.calls[0]
		expect(url).toBe(INDEXNOW_ENDPOINT)
		expect(init?.method).toBe("POST")
		expect(JSON.parse(init?.body as string)).toEqual({
			host: "roland.leth.ro",
			key: "the-key",
			keyLocation: "https://roland.leth.ro/indexnow-key.txt",
			urlList: base.urls,
		})
	})

	it("treats 202 as success", async () => {
		const result = await submitToIndexNow({
			...base,
			fetchImpl: fetchStub(202),
		})
		expect(result.ok).toBe(true)
	})

	it("reports a non-2xx status with its body as the message", async () => {
		const result = await submitToIndexNow({
			...base,
			fetchImpl: fetchStub(403, "key not found"),
		})

		expect(result.ok).toBe(false)
		expect(result.batches[0]).toMatchObject({
			status: 403,
			ok: false,
			message: "key not found",
		})
	})

	it("captures a transport error as status 0", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error("network down")
		})

		const result = await submitToIndexNow({ ...base, fetchImpl })

		expect(result.ok).toBe(false)
		expect(result.batches[0]).toMatchObject({
			status: 0,
			ok: false,
			message: "network down",
		})
	})

	it("uses the vendor-neutral endpoint by default", () => {
		expect(INDEXNOW_ENDPOINT).toBe("https://api.indexnow.org/indexnow")
	})
})

// #endregion
