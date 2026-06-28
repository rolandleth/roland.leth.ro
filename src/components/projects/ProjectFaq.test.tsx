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

	it("keeps every answer in the DOM on mount so it's crawlable", () => {
		// The SEO/AI-citation goal: collapsed answers must be in the server HTML,
		// not conditionally mounted. They're just hidden, not absent.
		renderFaq()

		expect(screen.getByText("Yes, forever.")).toBeInTheDocument()
		expect(screen.getByText("In the background.")).toBeInTheDocument()
	})

	it("marks collapsed panels inert + aria-hidden so assistive tech skips them", () => {
		const { container } = renderFaq()

		const panel = container.querySelector("#faq-panel-1")
		expect(panel).toHaveAttribute("inert")
		expect(panel).toHaveAttribute("aria-hidden", "true")
	})

	it("clears inert + aria-hidden on the panel when its question is expanded", async () => {
		const { container } = renderFaq()

		await user.click(screen.getByRole("button", { name: /is it free/i }))

		const panel = container.querySelector("#faq-panel-1")
		expect(panel).not.toHaveAttribute("inert")
		expect(panel).toHaveAttribute("aria-hidden", "false")
		expect(screen.getByRole("button", { name: /is it free/i })).toHaveAttribute(
			"aria-expanded",
			"true"
		)
	})

	it("collapses an open question when its button is clicked again", async () => {
		const { container } = renderFaq()

		const button = screen.getByRole("button", { name: /is it free/i })
		await user.click(button)
		expect(button).toHaveAttribute("aria-expanded", "true")

		await user.click(button)
		expect(button).toHaveAttribute("aria-expanded", "false")
		expect(container.querySelector("#faq-panel-1")).toHaveAttribute("inert")
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
