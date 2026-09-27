import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { adminListUrlFor, rememberAdminListUrl } from "./adminListReturn"

beforeEach(() => {
	window.sessionStorage.clear()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe("adminListUrlFor", () => {
	it("falls back to the tab's first page when nothing was remembered", () => {
		expect(adminListUrlFor("posts")).toBe("/admin")
		expect(adminListUrlFor("guides")).toBe("/admin?tab=guides")
	})

	it("returns the remembered list when it shows the same tab", () => {
		rememberAdminListUrl("/admin?tab=guides&q=notes&page=2")

		expect(adminListUrlFor("guides")).toBe("/admin?tab=guides&q=notes&page=2")
	})

	it("treats a remembered URL without `tab` as the Posts tab", () => {
		rememberAdminListUrl("/admin?page=4")

		expect(adminListUrlFor("posts")).toBe("/admin?page=4")
		expect(adminListUrlFor("projects")).toBe("/admin?tab=projects")
	})

	it("remembers only the latest list", () => {
		rememberAdminListUrl("/admin?page=2")
		rememberAdminListUrl("/admin?page=5")

		expect(adminListUrlFor("posts")).toBe("/admin?page=5")
	})

	it.each([
		"https://evil.example/admin",
		"//evil.example",
		"/admin/posts/1",
		"/administrator",
	])("ignores a stored value that isn't a dashboard URL: %j", (value) => {
		window.sessionStorage.setItem("admin:lastListUrl", value)

		expect(adminListUrlFor("posts")).toBe("/admin")
	})

	it("falls back and warns when storage can't be read", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		// Blocked site data throws on the `sessionStorage` access itself.
		vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
			throw new Error("blocked")
		})

		expect(adminListUrlFor("projects")).toBe("/admin?tab=projects")
		expect(warn).toHaveBeenCalledWith(
			"[adminListReturn] could not read the list URL",
			expect.any(Error)
		)
	})
})

describe("rememberAdminListUrl", () => {
	it("warns instead of throwing when storage can't be written", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
			throw new Error("blocked")
		})

		expect(() => rememberAdminListUrl("/admin?page=2")).not.toThrow()
		expect(warn).toHaveBeenCalledWith(
			"[adminListReturn] could not remember the list URL",
			expect.any(Error)
		)
	})
})
