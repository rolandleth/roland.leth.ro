import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { adminListUrlFor } from "@/lib/client/adminListReturn"
import RememberAdminListUrl from "./RememberAdminListUrl"

beforeEach(() => {
	window.sessionStorage.clear()
})

describe("RememberAdminListUrl", () => {
	it("records the list it is rendered with", () => {
		render(<RememberAdminListUrl href="/admin?tab=guides&page=2" />)

		expect(adminListUrlFor("guides")).toBe("/admin?tab=guides&page=2")
	})

	it("records the new list when the dashboard navigates", () => {
		const { rerender } = render(<RememberAdminListUrl href="/admin?page=2" />)

		rerender(<RememberAdminListUrl href="/admin?q=draft" />)

		expect(adminListUrlFor("posts")).toBe("/admin?q=draft")
	})

	it("renders nothing", () => {
		const { container } = render(<RememberAdminListUrl href="/admin" />)

		expect(container).toBeEmptyDOMElement()
	})
})
