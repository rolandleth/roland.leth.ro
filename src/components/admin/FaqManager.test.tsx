import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import FaqManager, { type FaqItem } from "./FaqManager"

const user = setupUser()

function makeFaq(partial: Partial<FaqItem> = {}): FaqItem {
	return {
		_key: partial._key ?? "k",
		question: partial.question ?? "Is it free?",
		answer: partial.answer ?? "Yes.",
		sortOrder: partial.sortOrder ?? 0,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Add

describe("FaqManager add", () => {
	it("appends an empty FAQ with the next sortOrder when Add FAQ is clicked", async () => {
		const existing = [makeFaq({ _key: "a", sortOrder: 0 })]
		const onChange = vi.fn()

		render(<FaqManager value={existing} onChange={onChange} />)
		await user.click(screen.getByRole("button", { name: /add faq/i }))

		expect(onChange).toHaveBeenCalledOnce()
		const next = onChange.mock.calls[0][0] as FaqItem[]
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({ question: "", answer: "", sortOrder: 1 })
		expect(typeof next[1]._key).toBe("string")
	})
})

// #endregion

// #region Remove / reindex

describe("FaqManager remove + reindex", () => {
	it("removes the targeted FAQ and compacts sortOrder values", async () => {
		const faqs = [
			makeFaq({ _key: "a", question: "Alpha", sortOrder: 0 }),
			makeFaq({ _key: "b", question: "Beta", sortOrder: 1 }),
			makeFaq({ _key: "c", question: "Charlie", sortOrder: 2 }),
		]
		const onChange = vi.fn()

		render(<FaqManager value={faqs} onChange={onChange} />)
		const removeButtons = screen.getAllByRole("button", { name: /remove/i })
		await user.click(removeButtons[1])

		const next = onChange.mock.calls[0][0] as FaqItem[]
		expect(next).toHaveLength(2)
		expect(next.map((f) => f.question)).toEqual(["Alpha", "Charlie"])
		expect(next.map((f) => f.sortOrder)).toEqual([0, 1])
	})
})

// #endregion

// #region Update

describe("FaqManager update", () => {
	it("updates only the targeted row's question field", async () => {
		const faqs = [
			makeFaq({ _key: "a", question: "Alpha" }),
			makeFaq({ _key: "b", question: "Beta" }),
		]
		const onChange = vi.fn()

		render(<FaqManager value={faqs} onChange={onChange} />)
		const questionInputs = screen.getAllByLabelText("FAQ question")
		await user.type(questionInputs[1], "!")

		const [latest] = onChange.mock.calls[onChange.mock.calls.length - 1] as [
			FaqItem[],
		]
		expect(latest[0].question).toBe("Alpha")
		expect(latest[1].question).toBe("Beta!")
	})

	it("updates the targeted row's answer via the Markdown editor", async () => {
		const faqs = [makeFaq({ _key: "a", answer: "Yes" })]
		const onChange = vi.fn()

		render(<FaqManager value={faqs} onChange={onChange} />)
		const answer = screen.getByPlaceholderText(/answer \(markdown supported\)/i)
		await user.type(answer, "!")

		const [latest] = onChange.mock.calls[onChange.mock.calls.length - 1] as [
			FaqItem[],
		]
		expect(latest[0].answer).toBe("Yes!")
	})
})

// #endregion
