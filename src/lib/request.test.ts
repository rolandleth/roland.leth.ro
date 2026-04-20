import { headers } from "next/headers"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { defaultProto, siteBase } from "@/lib/request"

vi.mock("next/headers", () => ({
	headers: vi.fn(),
}))

describe("defaultProto", () => {
	it("returns http for localhost", () => {
		expect(defaultProto("localhost")).toBe("http")
	})

	it("returns http for localhost with a port", () => {
		expect(defaultProto("localhost:3000")).toBe("http")
	})

	it("returns http for 127.0.0.1", () => {
		expect(defaultProto("127.0.0.1")).toBe("http")
	})

	it("returns http for 127.0.0.1 with a port", () => {
		expect(defaultProto("127.0.0.1:8080")).toBe("http")
	})

	it("returns https for a plain domain", () => {
		expect(defaultProto("example.com")).toBe("https")
	})

	it("returns https for a domain with an explicit port (regression: port should not imply dev)", () => {
		expect(defaultProto("example.com:8443")).toBe("https")
	})

	it("returns https for a domain with localhost as an embedded substring (not exact hostname)", () => {
		// "notlocalhost" is not the hostname "localhost"; exact-match after stripping the port.
		expect(defaultProto("notlocalhost.example.com")).toBe("https")
	})

	it("returns https for a hostname that shares the localhost prefix (e.g. localhostapp.example.com)", () => {
		expect(defaultProto("localhostapp.example.com")).toBe("https")
	})
})

describe("siteBase", () => {
	beforeEach(() => {
		vi.mocked(headers).mockReset()
	})

	it("throws when host header is missing", async () => {
		vi.mocked(headers).mockResolvedValue(
			new Headers() as Awaited<ReturnType<typeof headers>>
		)
		await expect(siteBase()).rejects.toThrow("Missing host header")
	})

	it("uses x-forwarded-proto over defaultProto when present", async () => {
		vi.mocked(headers).mockResolvedValue(
			new Headers({
				host: "localhost",
				"x-forwarded-proto": "https",
			}) as Awaited<ReturnType<typeof headers>>
		)
		expect(await siteBase()).toBe("https://localhost")
	})

	it("falls back to defaultProto when x-forwarded-proto is absent", async () => {
		vi.mocked(headers).mockResolvedValue(
			new Headers({ host: "localhost:3000" }) as Awaited<
				ReturnType<typeof headers>
			>
		)
		expect(await siteBase()).toBe("http://localhost:3000")
	})

	it("returns https base for a production domain without x-forwarded-proto", async () => {
		vi.mocked(headers).mockResolvedValue(
			new Headers({ host: "roland.leth.ro" }) as Awaited<
				ReturnType<typeof headers>
			>
		)
		expect(await siteBase()).toBe("https://roland.leth.ro")
	})
})
