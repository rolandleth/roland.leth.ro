import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Pagination from "@/components/blog/Pagination"

/**
 * Both hrefs were rewired to `blogPagePath` with nothing covering them.
 *
 * The load-bearing case is prev-from-page-2: it must resolve to the bare
 * `/blog/:section`, not `/p/1`. That is the entire duplicate-content contract —
 * one page, one URL — and it rested on a single un-asserted ternary inside
 * `blogPagePath`.
 */

function renderPagination(page: number, totalPages: number) {
	render(<Pagination page={page} totalPages={totalPages} section="tech" />)
}

function linkHref(name: string): string | null {
	return screen.getByRole("link", { name }).getAttribute("href")
}

// #region Link targets

describe("Pagination — link targets", () => {
	it("points Newer at the bare section path from page 2", () => {
		// The contract. `/blog/tech/p/1` is redirected to `/blog/tech` in
		// `next.config.ts`, so linking it here would send every reader paging
		// back from page 2 through a needless 308 — and publish a second URL for
		// page 1 into the crawl graph.
		renderPagination(2, 3)

		expect(linkHref("Newer")).toBe("/blog/tech")
	})

	it("points Newer at a /p/ path from page 3", () => {
		renderPagination(3, 5)

		expect(linkHref("Newer")).toBe("/blog/tech/p/2")
	})

	it("points Older at the next page", () => {
		renderPagination(2, 5)

		expect(linkHref("Older")).toBe("/blog/tech/p/3")
	})

	it("points Older at /p/2 from page 1", () => {
		renderPagination(1, 5)

		expect(linkHref("Older")).toBe("/blog/tech/p/2")
	})
})

// #endregion

// #region Edges

describe("Pagination — edges", () => {
	it("renders no Newer link on page 1", () => {
		renderPagination(1, 3)

		expect(screen.queryByRole("link", { name: "Newer" })).toBeNull()
	})

	it("renders no Older link on the last page", () => {
		renderPagination(3, 3)

		expect(screen.queryByRole("link", { name: "Older" })).toBeNull()
	})

	it("renders neither link when there is one page", () => {
		renderPagination(1, 1)

		expect(screen.queryAllByRole("link")).toHaveLength(0)
	})

	it("renders no Older link past the end", () => {
		// A deletion can strand a page that used to exist; the route 404s that,
		// but the component must not offer a link deeper into nothing either.
		renderPagination(4, 3)

		expect(screen.queryByRole("link", { name: "Older" })).toBeNull()
	})
})

// #endregion

// #region Accessibility

describe("Pagination — accessibility", () => {
	it("labels the nav landmark", () => {
		// Two list-page landmarks with no accessible name are indistinguishable
		// in a screen reader's landmark menu.
		renderPagination(2, 3)

		expect(screen.getByRole("navigation", { name: "Pagination" })).toBeTruthy()
	})

	it("states the position in text, not only in link direction", () => {
		renderPagination(2, 5)

		expect(screen.getByText("2 / 5")).toBeTruthy()
	})
})

// #endregion
