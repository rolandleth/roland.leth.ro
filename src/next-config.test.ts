import { beforeEach, describe, expect, it, vi } from "vitest"
import nextConfig from "../next.config"

async function getHeaders() {
	const [rule] = await nextConfig.headers!()
	return rule.headers as { key: string; value: string }[]
}

function getCsp(headers: { key: string; value: string }[]) {
	return headers.find((h) => h.key === "Content-Security-Policy")!.value
}

function getDirective(csp: string, name: string) {
	return csp.split("; ").find((d) => d.startsWith(name))
}

// #region Route coverage

describe("nextConfig.headers — route coverage", () => {
	it("applies to all routes", async () => {
		const [rule] = await nextConfig.headers!()
		expect(rule.source).toBe("/(.*)")
	})
})

// #endregion

// #region Static headers

describe("nextConfig.headers — static headers", () => {
	it("sets X-Content-Type-Options to nosniff", async () => {
		const headers = await getHeaders()
		expect(headers).toContainEqual({
			key: "X-Content-Type-Options",
			value: "nosniff",
		})
	})

	it("sets X-Frame-Options to DENY", async () => {
		const headers = await getHeaders()
		expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
	})

	it("sets Referrer-Policy", async () => {
		const headers = await getHeaders()
		expect(headers).toContainEqual({
			key: "Referrer-Policy",
			value: "strict-origin-when-cross-origin",
		})
	})

	it("sets Strict-Transport-Security", async () => {
		const headers = await getHeaders()
		expect(headers).toContainEqual({
			key: "Strict-Transport-Security",
			value: "max-age=63072000; includeSubDomains; preload",
		})
	})

	it("sets Permissions-Policy", async () => {
		const headers = await getHeaders()
		expect(headers).toContainEqual({
			key: "Permissions-Policy",
			value: "camera=(), microphone=(), geolocation=()",
		})
	})
})

// #endregion

// #region CSP — production

describe("nextConfig.headers — CSP in production", () => {
	beforeEach(() => {
		vi.stubEnv("NODE_ENV", "production")
	})

	it("sets default-src", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "default-src")).toBe("default-src 'self'")
	})

	it("sets script-src without unsafe-eval", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "script-src")).toBe(
			"script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com"
		)
	})

	it("sets style-src", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "style-src")).toBe(
			"style-src 'self' 'unsafe-inline'"
		)
	})

	it("sets img-src without picsum", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "img-src")).toBe(
			"img-src 'self' data: https://*.public.blob.vercel-storage.com"
		)
	})

	it("sets font-src", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "font-src")).toBe("font-src 'self' data:")
	})

	it("sets connect-src", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "connect-src")).toBe(
			"connect-src 'self' https://vitals.vercel-insights.com"
		)
	})

	it("sets frame-ancestors", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
	})
})

// #endregion

// #region CSP — development

describe("nextConfig.headers — CSP in development", () => {
	beforeEach(() => {
		vi.stubEnv("NODE_ENV", "development")
	})

	it("sets script-src with unsafe-eval", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "script-src")).toBe(
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
		)
	})

	it("sets img-src with picsum", async () => {
		const csp = getCsp(await getHeaders())
		expect(getDirective(csp, "img-src")).toBe(
			"img-src 'self' data: https://*.public.blob.vercel-storage.com https://picsum.photos https://fastly.picsum.photos"
		)
	})
})

// #endregion
