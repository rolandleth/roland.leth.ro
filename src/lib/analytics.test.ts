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

	it("does not drop paths that merely start with /admin- (anchored on path segment)", () => {
		// Prior bug: `.includes("/admin")` ate `/admin-notes`. Fix splits on URL
		// pathname and matches `/admin/...` boundary so adjacent prefixes are safe.
		const event = { url: "https://site/admin-notes" }
		expect(filterAdminEvents(event)).toBe(event)
	})

	it("does not drop nested paths that contain `/admin` mid-segment", () => {
		const event = { url: "https://site/blog/tech/admin-tools" }
		expect(filterAdminEvents(event)).toBe(event)
	})

	it("preserves extra fields on the event shape", () => {
		// `filterAdminEvents` is generic; non-admin events must retain every
		// field untouched so the analytics beacon arrives intact.
		const event = { url: "https://site/projects", ts: 12345, extra: "hi" }
		expect(filterAdminEvents(event)).toEqual(event)
	})

	it("drops a relative /admin URL that has a fragment but no query string", () => {
		// Without stripping `#`, `split('?')[0]` on `/admin#section` returns
		// `/admin#section`, which fails the exact `/admin` check and passes through.
		expect(filterAdminEvents({ url: "/admin#section" })).toBeNull()
	})

	it("passes through /administrator (not a path-segment match)", () => {
		const event = { url: "/administrator" }
		expect(filterAdminEvents(event)).toBe(event)
	})
})
