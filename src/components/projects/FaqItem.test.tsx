import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { setupUser } from "@/test/user"
import FaqItem from "./FaqItem"

const user = setupUser()

function renderItem() {
	return render(
		<FaqItem
			id={7}
			buttonClassName="button"
			answerClassName="answer"
			question={<span>Is it free?</span>}
		>
			<p>Yes.</p>
		</FaqItem>
	)
}

describe("FaqItem", () => {
	// The open markers in both FAQs follow `data-open` through
	// `group-data-open/faq:` variants; without it they'd never turn.
	it("marks the item data-open only while its answer is open", async () => {
		const { container } = renderItem()
		const item = container.firstElementChild as HTMLElement
		const button = screen.getByRole("button", { name: "Is it free?" })

		expect(item).toHaveClass("group/faq")
		expect(item).not.toHaveAttribute("data-open")

		await user.click(button)
		expect(item).toHaveAttribute("data-open")

		await user.click(button)
		expect(item).not.toHaveAttribute("data-open")
	})

	it("puts the answer inside the given box, inside the animated panel", () => {
		renderItem()

		const answer = screen.getByText("Yes.").parentElement as HTMLElement

		expect(answer).toHaveClass("answer")
		expect(answer.parentElement).toHaveAttribute("id", "faq-panel-7")
	})
})
