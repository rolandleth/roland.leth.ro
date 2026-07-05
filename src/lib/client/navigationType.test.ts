// @vitest-environment happy-dom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import {
	installNavigationTypeTracking,
	isBackForwardNavigation,
} from "@/lib/client/navigationType"

// happy-dom doesn't implement the Navigation API; a bare EventTarget is enough
// since the module only listens for `currententrychange`.
let navigationStub: EventTarget

function emitEntryChange(
	navigationType: "reload" | "push" | "replace" | "traverse" | null
) {
	navigationStub.dispatchEvent(
		Object.assign(new Event("currententrychange"), { navigationType })
	)
}

describe("navigationType", () => {
	beforeAll(() => {
		navigationStub = new EventTarget()
		;(window as unknown as { navigation: EventTarget }).navigation =
			navigationStub
		installNavigationTypeTracking()
	})

	it("starts as a forward navigation before any history traversal", () => {
		expect(isBackForwardNavigation()).toBe(false)
	})

	it("flags back/forward navigation on a traverse entry change", () => {
		emitEntryChange("traverse")

		expect(isBackForwardNavigation()).toBe(true)
	})

	it("resets to forward navigation on a push entry change", () => {
		emitEntryChange("traverse")
		emitEntryChange("push")

		expect(isBackForwardNavigation()).toBe(false)
	})

	it("resets to forward navigation on a replace entry change", () => {
		emitEntryChange("traverse")
		emitEntryChange("replace")

		expect(isBackForwardNavigation()).toBe(false)
	})

	it("treats a null navigation type as a forward navigation", () => {
		emitEntryChange("traverse")
		emitEntryChange(null)

		expect(isBackForwardNavigation()).toBe(false)
	})

	it("stays idempotent when installed more than once", () => {
		installNavigationTypeTracking()
		emitEntryChange("traverse")

		expect(isBackForwardNavigation()).toBe(true)

		emitEntryChange("push")

		expect(isBackForwardNavigation()).toBe(false)
	})

	it("registers no second listener on repeat installs (no stacking)", () => {
		// The install guard already tripped in `beforeAll`, so further calls must
		// add zero `currententrychange` listeners. A behavioural check can't catch
		// stacking (duplicate listeners set the same flag), so assert on the
		// registration itself.
		const addSpy = vi.spyOn(navigationStub, "addEventListener")
		installNavigationTypeTracking()
		installNavigationTypeTracking()

		const entryChangeRegistrations = addSpy.mock.calls.filter(
			([type]) => type === "currententrychange"
		)
		expect(entryChangeRegistrations).toHaveLength(0)

		addSpy.mockRestore()
	})

	it('tags <html> with `data-navigation-api="available"` when the API is present', () => {
		expect(document.documentElement.dataset.navigationApi).toBe("available")
	})
})

describe("navigationType — fallback path (no Navigation API)", () => {
	beforeEach(() => {
		// Reset the module so the install guard runs from scratch on each test.
		vi.resetModules()
		delete (window as unknown as { navigation?: unknown }).navigation
		delete document.documentElement.dataset.navigationApi
	})

	it('tags <html> with `data-navigation-api="missing"` and leaves the flag false', async () => {
		const fresh = await import("@/lib/client/navigationType")
		fresh.installNavigationTypeTracking()

		expect(document.documentElement.dataset.navigationApi).toBe("missing")
		expect(fresh.isBackForwardNavigation()).toBe(false)
	})
})
