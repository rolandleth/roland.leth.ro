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

		expect(response.status).toBe(404)
		expect(await response.text()).not.toBe(KEY)
	})
})
