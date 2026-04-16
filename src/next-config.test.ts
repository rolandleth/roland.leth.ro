import { beforeAll, describe, expect, it, vi } from "vitest"
import nextConfig from "../next.config"

type Header = { key: string; value: string }

async function getHeaders(): Promise<Header[]> {
	const [rule] = await nextConfig.headers!()
	return rule.headers as Header[]
}

async function getRule() {
	const [rule] = await nextConfig.headers!()
	return rule
}

function getCsp(headers: Header[]): string {
	return headers.find((h) => h.key === "Content-Security-Policy")!.value
}

function getDirective(csp: string, name: string): string | undefined {
	return csp.split("; ").find((d) => d.startsWith(name))
}

// #region Route coverage + static headers

describe("nextConfig.headers — route coverage and static headers", () => {
	let headers: Header[]
	let rule: Awaited<ReturnType<typeof getRule>>

	beforeAll(async () => {
		rule = await getRule()
		headers = rule.headers as Header[]
	})

	it("applies to all routes", () => {
		expect(rule.source).toBe("/(.*)")
	})

	it("sets every static security header", () => {
		expect(headers).toContainEqual({
			key: "X-Content-Type-Options",
			value: "nosniff",
		})
		expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
		expect(headers).toContainEqual({
			key: "Referrer-Policy",
			value: "strict-origin-when-cross-origin",
		})
		expect(headers).toContainEqual({
			key: "Strict-Transport-Security",
			value: "max-age=63072000; includeSubDomains; preload",
		})
		expect(headers).toContainEqual({
			key: "Permissions-Policy",
			value: "camera=(), microphone=(), geolocation=()",
		})
	})
})

// #endregion

// #region CSP — production

describe("production headers", () => {
	let csp: string

	beforeAll(async () => {
		vi.stubEnv("NODE_ENV", "production")
		csp = getCsp(await getHeaders())
	})

	it("emits every production CSP directive with the expected value", () => {
		expect(getDirective(csp, "default-src")).toBe("default-src 'self'")
		expect(getDirective(csp, "script-src")).toBe(
			"script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com"
		)
		expect(getDirective(csp, "style-src")).toBe(
			"style-src 'self' 'unsafe-inline'"
		)
		expect(getDirective(csp, "img-src")).toBe(
			"img-src 'self' data: https://*.public.blob.vercel-storage.com"
		)
		expect(getDirective(csp, "font-src")).toBe("font-src 'self' data:")
		expect(getDirective(csp, "connect-src")).toBe(
			"connect-src 'self' https://vitals.vercel-insights.com"
		)
		expect(getDirective(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
	})
})

// #endregion

// #region CSP — development

describe("development headers", () => {
	let csp: string

	beforeAll(async () => {
		vi.stubEnv("NODE_ENV", "development")
		csp = getCsp(await getHeaders())
	})

	it("relaxes CSP for dev tooling", () => {
		expect(getDirective(csp, "script-src")).toBe(
			"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
		)
		expect(getDirective(csp, "img-src")).toBe(
			"img-src 'self' data: https://*.public.blob.vercel-storage.com https://picsum.photos https://fastly.picsum.photos"
		)
	})
})

// #endregion
