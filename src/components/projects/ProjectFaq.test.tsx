import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { setupUser } from "@/test/user"
import ProjectFaq from "./ProjectFaq"

const user = setupUser()

const faqs = [
	{ id: 1, question: "Is it free?" },
	{ id: 2, question: "Does it sync?" },
]
const answers = [
	<p key={1}>Yes, forever.</p>,
	<p key={2}>In the background.</p>,
]

function renderFaq() {
	return render(
		<ProjectFaq faqs={faqs} renderedAnswers={answers} accent="#6366f1" />
	)
}

describe("ProjectFaq", () => {
	it("renders every question as a collapsed button on mount", () => {
		renderFaq()

		const buttons = screen.getAllByRole("button")
		expect(buttons).toHaveLength(2)
		buttons.forEach((b) => expect(b).toHaveAttribute("aria-expanded", "false"))
	})

	it("expands a question's answer when its button is clicked", async () => {
		renderFaq()

		const button = screen.getByRole("button", { name: /is it free/i })
		await user.click(button)

		expect(button).toHaveAttribute("aria-expanded", "true")
		expect(screen.getByText("Yes, forever.")).toBeInTheDocument()
	})

	it("collapses an open question when its button is clicked again", async () => {
		renderFaq()

		const button = screen.getByRole("button", { name: /is it free/i })
		await user.click(button)
		expect(button).toHaveAttribute("aria-expanded", "true")

		await user.click(button)
		expect(button).toHaveAttribute("aria-expanded", "false")
	})

	it("toggles each question independently (multiple can be open at once)", async () => {
		renderFaq()

		const first = screen.getByRole("button", { name: /is it free/i })
		const second = screen.getByRole("button", { name: /does it sync/i })

		await user.click(first)
		await user.click(second)

		expect(first).toHaveAttribute("aria-expanded", "true")
		expect(second).toHaveAttribute("aria-expanded", "true")
	})

	it("links each panel to its button via aria-controls / aria-labelledby", async () => {
		renderFaq()

		const button = screen.getByRole("button", { name: /is it free/i })
		await user.click(button)

		const panel = screen.getByRole("region", { name: /is it free/i })
		expect(button).toHaveAttribute("aria-controls", panel.id)
		expect(panel).toHaveAttribute("aria-labelledby", button.id)
	})
})
