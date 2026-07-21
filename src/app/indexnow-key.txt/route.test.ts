import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/indexnow-key.txt/route"

const KEY = "test-key-1234abcd"

beforeEach(() => {
	vi.stubEnv("INDEXNOW_KEY", KEY)
})

describe("/indexnow-key.txt", () => {
	it("serves the key verbatim as plain text", async () => {
		const response = GET()

		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		)
		expect(await response.text()).toBe(KEY)
	})

	it("is not cached, so an env change is picked up on the next crawl", () => {
		expect(GET().headers.get("Cache-Control")).toBe("no-store")
	})

	it("404s when the key is not configured", async () => {
		vi.stubEnv("INDEXNOW_KEY", "")

		const response = GET()

		// Assert the literal body: `not.toBe(KEY)` also passes for an empty body
		// or any wrong string, so it can't tell a correct 404 from a broken one.
		expect(response.status).toBe(404)
		expect(await response.text()).toBe("Not found")
	})

	it("does not cache the 404 either", async () => {
		// A cached "no key here" keeps verification failing after INDEXNOW_KEY is
		// finally set — and setting the key after deploying is the normal order.
		vi.stubEnv("INDEXNOW_KEY", "")

		const response = GET()

		expect(response.headers.get("Cache-Control")).toBe("no-store")
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		)
	})
})
