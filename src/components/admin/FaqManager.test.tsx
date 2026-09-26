import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderOrderedList } from "@/test/renderOrderedList"
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

function renderFaqs(initial: FaqItem[]) {
	return renderOrderedList(initial, (value, onChange) => (
		<FaqManager value={value} onChange={onChange} />
	))
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Add

describe("FaqManager add", () => {
	it("appends an empty FAQ with the next sortOrder when Add FAQ is clicked", async () => {
		const { latest } = renderFaqs([makeFaq({ _key: "a", sortOrder: 0 })])
		await user.click(screen.getByRole("button", { name: /add faq/i }))

		const next = latest()
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({ question: "", answer: "", sortOrder: 1 })
		expect(typeof next[1]._key).toBe("string")
	})
})

// #endregion

// #region Remove / reindex

describe("FaqManager remove + reindex", () => {
	it("removes the targeted FAQ and compacts sortOrder values", async () => {
		const { latest } = renderFaqs([
			makeFaq({ _key: "a", question: "Alpha", sortOrder: 0 }),
			makeFaq({ _key: "b", question: "Beta", sortOrder: 1 }),
			makeFaq({ _key: "c", question: "Charlie", sortOrder: 2 }),
		])
		const removeButtons = screen.getAllByRole("button", { name: /remove/i })
		await user.click(removeButtons[1])

		const next = latest()
		expect(next).toHaveLength(2)
		expect(next.map((f) => f.question)).toEqual(["Alpha", "Charlie"])
		expect(next.map((f) => f.sortOrder)).toEqual([0, 1])
	})
})

// #endregion

// #region Update

describe("FaqManager update", () => {
	it("updates only the targeted row's question field", async () => {
		const { latest } = renderFaqs([
			makeFaq({ _key: "a", question: "Alpha" }),
			makeFaq({ _key: "b", question: "Beta" }),
		])
		const questionInputs = screen.getAllByLabelText("FAQ question")
		await user.type(questionInputs[1], "!")

		expect(latest().map((f) => f.question)).toEqual(["Alpha", "Beta!"])
	})

	it("updates the targeted row's answer via the Markdown editor", async () => {
		const { latest } = renderFaqs([makeFaq({ _key: "a", answer: "Yes" })])
		const answer = screen.getByPlaceholderText(/answer \(markdown supported\)/i)
		await user.type(answer, "!")

		expect(latest()[0].answer).toBe("Yes!")
	})
})

// #endregion
