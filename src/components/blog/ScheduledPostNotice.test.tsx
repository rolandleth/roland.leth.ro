import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ScheduledPostNotice from "./ScheduledPostNotice"

function renderNotice(
	section: "tech" | "life" = "tech",
	datetime = "2999-01-04-0900"
) {
	return render(
		<ScheduledPostNotice
			title="Hello World"
			datetime={datetime}
			section={section}
		/>
	)
}

// #region copy

describe("ScheduledPostNotice", () => {
	it("teases the title and the full publish date, year included", () => {
		const { container } = renderNotice()

		expect(container.textContent).toContain("“Hello World”")
		expect(container.textContent).toContain("isn’t live yet")
		expect(container.textContent).toContain("Jan 4, 2999")
	})

	it("renders the backdrop glyph as the day + month, hidden from assistive tech", () => {
		const { container } = renderNotice()
		const glyph = container.querySelector("[aria-hidden]")

		// Decorative: the body copy above already carries the date with its year,
		// so announcing a second, year-less copy of it would only be noise.
		expect(glyph?.textContent).toBe("Jan 4")
	})

	it("gives the notice a single top-level heading", () => {
		renderNotice()

		expect(
			screen.getByRole("heading", { level: 1, name: "Scheduled" })
		).toBeInTheDocument()
	})
})

// #endregion

// #region section-dependent links

describe("ScheduledPostNotice links", () => {
	// Both hrefs are derived from `section`, and the page only ever renders this
	// for one section at a time — so a hard-coded "tech" would look correct in
	// every tech test and send every life visitor to the wrong feed and index.
	it.for([
		["tech", "/blog/tech/feed.xml", "/blog/tech"],
		["life", "/blog/life/feed.xml", "/blog/life"],
	] as const)(
		"points both links at the %s section",
		([section, feedPath, indexPath]) => {
			renderNotice(section)

			expect(screen.getByRole("link", { name: "the feed" })).toHaveAttribute(
				"href",
				feedPath
			)
			expect(
				screen.getByRole("link", { name: "← Back to the blog" })
			).toHaveAttribute("href", indexPath)
		}
	)
})

// #endregion
