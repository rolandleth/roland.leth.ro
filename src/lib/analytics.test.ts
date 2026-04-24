import { describe, expect, it } from "vitest"
import { filterAdminEvents } from "@/lib/analytics"

describe("filterAdminEvents", () => {
	it("returns null for events whose url contains /admin", () => {
		// Keeps admin navigation out of Vercel Analytics — the admin area is
		// single-user, so those events would distort non-admin metrics.
		expect(filterAdminEvents({ url: "https://site/admin" })).toBeNull()
	})

	it("returns null for nested admin routes", () => {
		expect(
			filterAdminEvents({ url: "https://site/admin/posts/1/edit" })
		).toBeNull()
	})

	it("returns null for the login page", () => {
		expect(filterAdminEvents({ url: "https://site/admin/login" })).toBeNull()
	})

	it("passes through public pages", () => {
		const event = { url: "https://site/blog/tech" }
		expect(filterAdminEvents(event)).toBe(event)
	})

	it("passes through the home page", () => {
		const event = { url: "https://site/" }
		expect(filterAdminEvents(event)).toBe(event)
	})

	it("passes through URLs where 'admin' appears without the leading slash", () => {
		// The filter uses `.includes("/admin")`, so `?ref=fromadmin` (no leading
		// slash in front of `admin`) is correctly treated as non-admin.
		const event = { url: "https://site/blog/tech?ref=fromadmin" }
		expect(filterAdminEvents(event)).toBe(event)
	})

	it("drops paths that happen to start with /admin- (known substring false positive)", () => {
		// `.includes("/admin")` matches `/admin-notes` and similar prefixed
		// paths even though they are not in the admin area. Pinned so a future
		// word-boundary fix is an explicit change.
		expect(filterAdminEvents({ url: "https://site/admin-notes" })).toBeNull()
	})

	it("preserves extra fields on the event shape", () => {
		// `filterAdminEvents` is generic; non-admin events must retain every
		// field untouched so the analytics beacon arrives intact.
		const event = { url: "https://site/projects", ts: 12345, extra: "hi" }
		expect(filterAdminEvents(event)).toEqual(event)
	})
})
