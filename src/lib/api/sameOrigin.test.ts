import { beforeEach, describe, expect, it, vi } from "vitest"
import { refuseCrossSiteWrite } from "./sameOrigin"

const URL_ON_SITE = "https://roland.leth.ro/api/admin/posts"

function request(method: string, headers: Record<string, string> = {}) {
	return new Request(URL_ON_SITE, { method, headers })
}

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

describe("refuseCrossSiteWrite", () => {
	it.each(["GET", "HEAD", "OPTIONS"])(
		"lets a %s through whatever its headers say",
		(method) => {
			const result = refuseCrossSiteWrite(
				request(method, {
					"sec-fetch-site": "cross-site",
					origin: "https://evil.example",
				}),
				"[test]"
			)

			expect(result).toBeNull()
		}
	)

	it.each(["POST", "PUT", "PATCH", "DELETE"])(
		"lets a same-origin %s through",
		(method) => {
			const result = refuseCrossSiteWrite(
				request(method, {
					"sec-fetch-site": "same-origin",
					origin: "https://roland.leth.ro",
				}),
				"[test]"
			)

			expect(result).toBeNull()
		}
	)

	it("lets a write with neither header through, as a script or curl sends it", () => {
		expect(refuseCrossSiteWrite(request("POST"), "[test]")).toBeNull()
	})

	it.each(["same-site", "cross-site", "none"])(
		"refuses a write whose Sec-Fetch-Site is %j",
		async (fetchSite) => {
			const result = refuseCrossSiteWrite(
				request("POST", { "sec-fetch-site": fetchSite }),
				"[test]"
			)

			expect(result?.status).toBe(403)
			expect(await result?.json()).toEqual({
				error: "Cross-site request refused",
			})
		}
	)

	it("refuses a sibling subdomain, which SameSite=Lax lets the cookie through for", () => {
		const result = refuseCrossSiteWrite(
			request("POST", {
				"sec-fetch-site": "same-site",
				origin: "https://blog.leth.ro",
			}),
			"[test]"
		)

		expect(result?.status).toBe(403)
	})

	it.each([
		"https://evil.example",
		// eslint-disable-next-line sonarjs/no-clear-text-protocols -- the scheme mismatch is the case under test
		"http://roland.leth.ro",
		"https://roland.leth.ro:8443",
		"null",
	])(
		"refuses a write from Origin %j when Sec-Fetch-Site is absent",
		(origin) => {
			const result = refuseCrossSiteWrite(
				request("DELETE", { origin }),
				"[test]"
			)

			expect(result?.status).toBe(403)
		}
	)

	it("refuses when the headers disagree, trusting neither", () => {
		const result = refuseCrossSiteWrite(
			request("POST", {
				"sec-fetch-site": "same-origin",
				origin: "https://evil.example",
			}),
			"[test]"
		)

		expect(result?.status).toBe(403)
	})

	it("logs both headers at warn level with the route tag", () => {
		refuseCrossSiteWrite(
			request("POST", {
				"sec-fetch-site": "cross-site",
				origin: "https://evil.example",
			}),
			"[api:admin:posts:POST]"
		)

		expect(console.warn).toHaveBeenCalledWith(
			"[api:admin:posts:POST] cross-site write refused",
			{ secFetchSite: "cross-site", origin: "https://evil.example" }
		)
	})

	it("does not log a request it lets through", () => {
		refuseCrossSiteWrite(
			request("POST", { "sec-fetch-site": "same-origin" }),
			"[test]"
		)

		expect(console.warn).not.toHaveBeenCalled()
	})
})
