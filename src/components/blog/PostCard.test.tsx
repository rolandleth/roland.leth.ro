import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { makePost } from "@/test/fixtures"
import PostCard from "./PostCard"

// The excerpt renders through an async server component, which the DOM
// renderer can't await; the stub shows what the card hands it.
vi.mock("./PostMarkdownContent", () => ({
	default: ({
		content,
		isListCard,
	}: {
		content: string
		isListCard?: boolean
	}) => (
		<div data-testid="excerpt" data-list-card={String(isListCard === true)}>
			{content}
		</div>
	),
}))

describe("PostCard", () => {
	it("renders its excerpt as a list card, so its videos fetch nothing until played", async () => {
		render(
			await PostCard({
				post: makePost({ body: "![A demo](/videos/demo.mp4)" }),
			})
		)

		const excerpt = screen.getByTestId("excerpt")

		expect(excerpt).toHaveAttribute("data-list-card", "true")
		expect(excerpt).toHaveTextContent("![A demo](/videos/demo.mp4)")
	})
})
