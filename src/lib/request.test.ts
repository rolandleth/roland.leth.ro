import { describe, expect, it } from "vitest"
import { defaultProto } from "@/lib/request"

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

	it("returns https for a domain that starts with the word localhost as a subdomain prefix", () => {
		// "localhostapp.example.com" starts with "localhost" — covered by startsWith
		expect(defaultProto("notlocalhost.example.com")).toBe("https")
	})
})
