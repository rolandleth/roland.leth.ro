import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import Header from "./Header"

const { usePathname } = vi.hoisted(() => ({
	usePathname: vi.fn<() => string>(),
}))

vi.mock("next/navigation", () => ({ usePathname }))

describe("Header", () => {
	beforeEach(() => {
		usePathname.mockReturnValue("/projects/reckon")
	})

	it("carries the hook a page's own `<style>` block restyles it through", () => {
		// `ProductPageStyle` targets `[data-site-header]` to give the header the
		// hero's band colour. Without the attribute the rule matches nothing and
		// the product page's band ends at a plain bar, with no error anywhere.
		render(<Header />)

		expect(screen.getByRole("banner")).toHaveAttribute("data-site-header")
	})

	it.each(["/", "/admin", "/admin/posts"])("renders nothing on %s", (path) => {
		usePathname.mockReturnValue(path)
		const { container } = render(<Header />)

		expect(container).toBeEmptyDOMElement()
	})

	it("renders on the admin login page", () => {
		usePathname.mockReturnValue("/admin/login")
		render(<Header />)

		expect(screen.getByRole("banner")).toBeInTheDocument()
	})

	it("marks the current section's link", () => {
		render(<Header />)

		expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute(
			"aria-current",
			"page"
		)
		expect(screen.getByRole("link", { name: "Blog" })).not.toHaveAttribute(
			"aria-current"
		)
	})
})
