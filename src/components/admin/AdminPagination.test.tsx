import { render, screen } from "@testing-library/react"
import { redirect } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AdminPagination from "./AdminPagination"

vi.mock("next/navigation", () => ({
	redirect: vi.fn(() => {
		throw new Error("REDIRECT")
	}),
}))

function urlForPage(page: number) {
	return `/admin?page=${page}`
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe("AdminPagination — out-of-range page", () => {
	it("redirects to the last real page when page exceeds totalPages", () => {
		expect(() =>
			render(
				<AdminPagination page={5000} totalPages={3} urlForPage={urlForPage} />
			)
		).toThrow("REDIRECT")

		expect(redirect).toHaveBeenCalledWith("/admin?page=3")
	})

	it("does not redirect when page is within range", () => {
		render(<AdminPagination page={2} totalPages={3} urlForPage={urlForPage} />)

		expect(redirect).not.toHaveBeenCalled()
	})

	it("does not redirect an empty corpus, even with a large page", () => {
		// totalPages 0 is a legitimately empty corpus, not an out-of-range page —
		// same distinction the public blog list draws between page 1 of an empty
		// section and a page past a real one.
		render(
			<AdminPagination page={5000} totalPages={0} urlForPage={urlForPage} />
		)

		expect(redirect).not.toHaveBeenCalled()
	})
})

describe("AdminPagination — rendering", () => {
	it("renders nothing for a single-page corpus", () => {
		const { container } = render(
			<AdminPagination page={1} totalPages={1} urlForPage={urlForPage} />
		)

		expect(container).toBeEmptyDOMElement()
	})

	it("renders nothing for an empty corpus", () => {
		const { container } = render(
			<AdminPagination page={1} totalPages={0} urlForPage={urlForPage} />
		)

		expect(container).toBeEmptyDOMElement()
	})

	it("shows the page count for a multi-page corpus", () => {
		render(<AdminPagination page={2} totalPages={3} urlForPage={urlForPage} />)

		expect(screen.getByText("2 / 3")).toBeTruthy()
	})

	it("hides Previous on the first page", () => {
		render(<AdminPagination page={1} totalPages={3} urlForPage={urlForPage} />)

		expect(screen.queryByText("← Previous")).toBeNull()
		expect(screen.getByText("Next →")).toBeTruthy()
	})

	it("hides Next on the last page", () => {
		render(<AdminPagination page={3} totalPages={3} urlForPage={urlForPage} />)

		expect(screen.queryByText("Next →")).toBeNull()
		expect(screen.getByText("← Previous")).toBeTruthy()
	})
})
