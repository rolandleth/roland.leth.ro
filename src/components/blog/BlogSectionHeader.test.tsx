import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import BlogSectionHeader from "./BlogSectionHeader"

vi.mock("./SearchForm", () => ({
	default: function MockSearchForm({
		section,
		placeholder,
		action,
	}: {
		section: string
		placeholder: string
		action?: React.ReactNode
	}) {
		return (
			<form data-testid="search-form" data-section={section}>
				<input type="search" placeholder={placeholder} />
				{action}
			</form>
		)
	},
}))

const user = setupUser()

describe("BlogSectionHeader", () => {
	it("renders the label as a heading by default", () => {
		render(<BlogSectionHeader section="tech" label="Tech" />)
		expect(
			screen.getByRole("heading", { level: 1, name: "Tech" })
		).toBeInTheDocument()
	})

	it("hides the heading and renders the search form on icon click", async () => {
		render(<BlogSectionHeader section="tech" label="Tech" />)
		await user.click(screen.getByRole("button", { name: /search posts/i }))

		const form = await screen.findByTestId("search-form")
		expect(form).toBeInTheDocument()
		expect(form).toHaveAttribute("data-section", "tech")
	})

	it("returns to the heading when the cancel button is clicked", async () => {
		render(<BlogSectionHeader section="tech" label="Tech" />)
		await user.click(screen.getByRole("button", { name: /search posts/i }))

		const cancel = await screen.findByRole("button", { name: /cancel search/i })
		await user.click(cancel)

		expect(
			await screen.findByRole("heading", { level: 1, name: "Tech" })
		).toBeInTheDocument()
	})

	it("returns to the heading on outside click while searching", async () => {
		render(
			<>
				<BlogSectionHeader section="tech" label="Tech" />
				<button data-testid="outside">outside</button>
			</>
		)
		await user.click(screen.getByRole("button", { name: /search posts/i }))
		await screen.findByTestId("search-form")

		await user.click(screen.getByTestId("outside"))

		expect(
			await screen.findByRole("heading", { level: 1, name: "Tech" })
		).toBeInTheDocument()
	})

	it("passes the correct lowercased placeholder to SearchForm", async () => {
		render(<BlogSectionHeader section="tech" label="Tech" />)
		await user.click(screen.getByRole("button", { name: /search posts/i }))

		// Placeholder pinning: the existing convention is "Search tech…" not
		// "Search Tech…".
		expect(
			await screen.findByPlaceholderText("Search tech…")
		).toBeInTheDocument()
	})
})
