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
		expect(isSubmittableOrigin("https://[::1]")).toBe(false)
	})

	it("rejects every IP literal, not just loopback", () => {
		// A dot check alone waves these through, which is how a private-range or
		// public-IP origin would reach IndexNow as though it were a site host.
		expect(isSubmittableOrigin("https://127.0.0.2")).toBe(false)
		expect(isSubmittableOrigin("https://10.0.0.5")).toBe(false)
		expect(isSubmittableOrigin("https://192.168.1.10")).toBe(false)
		expect(isSubmittableOrigin("https://0.0.0.0")).toBe(false)
		expect(isSubmittableOrigin("https://93.184.216.34")).toBe(false)
		expect(isSubmittableOrigin("https://[2001:db8::1]")).toBe(false)
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

	it("treats a differing port as off-host", () => {
		// The comparison is on `.host`, which includes the port, so a URL on the
		// same hostname but a different port is flagged rather than passed through.
		expect(
			findForeignHostUrls("localhost:3000", [
				"http://localhost:3000/a",
				"http://localhost:4000/b",
			])
		).toEqual(["http://localhost:4000/b"])
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
		expect(result.attempted).toBe(2)
		expect(result.accepted).toBe(2)
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

	it("sends the JSON content type and an abort signal", async () => {
		// IndexNow rejects a submission without the JSON content type, and a
		// dropped signal means a hung endpoint stalls the admin request forever —
		// both break production while every other assertion here stays green.
		const fetchImpl = fetchStub(200)

		await submitToIndexNow({ ...base, fetchImpl })

		const [, init] = fetchImpl.mock.calls[0]
		expect(init?.headers).toMatchObject({
			"Content-Type": "application/json; charset=utf-8",
		})
		expect(init?.signal).toBeInstanceOf(AbortSignal)
	})

	it("applies the default 10s timeout when none is given", async () => {
		// The signal assertion above wouldn't catch a regression to a wrong
		// default, which silently changes how long a hung endpoint stalls a submit.
		const timeoutSpy = vi.spyOn(AbortSignal, "timeout")
		const fetchImpl = fetchStub(200)

		await submitToIndexNow({ ...base, fetchImpl })

		expect(timeoutSpy).toHaveBeenCalledWith(10_000)

		timeoutSpy.mockRestore()
	})

	it("honours an endpoint override", async () => {
		const fetchImpl = fetchStub(200)

		await submitToIndexNow({
			...base,
			endpoint: "https://example.test/indexnow",
			fetchImpl,
		})

		expect(fetchImpl.mock.calls[0][0]).toBe("https://example.test/indexnow")
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

	it("captures a transport error as status 0 and names the error class", async () => {
		const fetchImpl = vi.fn(async () => {
			throw new Error("network down")
		})

		const result = await submitToIndexNow({ ...base, fetchImpl })

		expect(result.ok).toBe(false)
		expect(result.batches[0]).toMatchObject({
			status: 0,
			ok: false,
			message: "network down",
			errorName: "Error",
		})
	})

	it("distinguishes a timeout from other transport failures", async () => {
		// `message` is runtime-dependent prose; `errorName` is what lets the panel
		// say "the timeout was too short" rather than "something went wrong".
		const fetchImpl = vi.fn(async () => {
			throw new DOMException("The operation timed out.", "TimeoutError")
		})

		const result = await submitToIndexNow({ ...base, fetchImpl })

		expect(result.batches[0]).toMatchObject({
			status: 0,
			errorName: "TimeoutError",
		})
	})

	it("records a null errorName when the request completed", async () => {
		const result = await submitToIndexNow({
			...base,
			fetchImpl: fetchStub(403),
		})

		expect(result.batches[0].errorName).toBeNull()
	})

	it("splits over the batch size and counts only accepted URLs", async () => {
		// Three batches: accept, reject, accept. `attempted` stays at the full set
		// while `accepted` drops the rejected batch's URLs.
		const statuses = [200, 403, 200]
		let call = 0
		const fetchImpl = vi.fn(
			async () => new Response("", { status: statuses[call++] })
		)

		const result = await submitToIndexNow({
			...base,
			urls: ["a", "b", "c", "d", "e"].map((p) => `https://roland.leth.ro/${p}`),
			batchSize: 2,
			fetchImpl,
		})

		expect(fetchImpl).toHaveBeenCalledTimes(3)
		expect(result.ok).toBe(false)
		expect(result.attempted).toBe(5)
		expect(result.accepted).toBe(3)
		expect(result.batches.map((batch) => batch.status)).toEqual([200, 403, 200])
	})

	it("reports the batches that landed when a later batch fails", async () => {
		let call = 0
		const fetchImpl = vi.fn(async () => {
			call += 1

			if (call === 2) {
				throw new Error("network down")
			}

			return new Response("", { status: 200 })
		})

		const result = await submitToIndexNow({
			...base,
			urls: ["a", "b", "c", "d"].map((p) => `https://roland.leth.ro/${p}`),
			batchSize: 2,
			fetchImpl,
		})

		expect(result.ok).toBe(false)
		expect(result.accepted).toBe(2)
		expect(result.batches).toHaveLength(2)
		expect(result.batches[0]).toMatchObject({ status: 200, ok: true })
	})

	it("is ok when every batch is accepted", async () => {
		const result = await submitToIndexNow({
			...base,
			urls: ["a", "b", "c", "d"].map((p) => `https://roland.leth.ro/${p}`),
			batchSize: 2,
			fetchImpl: fetchStub(200),
		})

		expect(result.ok).toBe(true)
		expect(result.accepted).toBe(4)
	})

	it("is not ok for an empty URL list", async () => {
		// `[].every()` is vacuously true; reporting success for zero work would
		// read to the operator as a completed submission.
		const fetchImpl = fetchStub(200)

		const result = await submitToIndexNow({ ...base, urls: [], fetchImpl })

		expect(result.ok).toBe(false)
		expect(result.attempted).toBe(0)
		expect(result.accepted).toBe(0)
		expect(result.batches).toEqual([])
		expect(fetchImpl).not.toHaveBeenCalled()
	})

	it("uses the vendor-neutral endpoint by default", () => {
		expect(INDEXNOW_ENDPOINT).toBe("https://api.indexnow.org/indexnow")
	})
})

// #endregion
