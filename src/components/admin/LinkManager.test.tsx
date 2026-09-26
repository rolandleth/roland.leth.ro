import { screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { renderOrderedList } from "@/test/renderOrderedList"
import { setupUser } from "@/test/user"
import LinkManager, { type LinkItem } from "./LinkManager"

const user = setupUser()

function makeLink(partial: Partial<LinkItem> = {}): LinkItem {
	return {
		_key: partial._key ?? "k",
		label: partial.label ?? "GitHub",
		url: partial.url ?? "https://github.com/x",
		sortOrder: partial.sortOrder ?? 0,
	}
}

function renderLinks(initial: LinkItem[]) {
	return renderOrderedList(initial, (value, onChange) => (
		<LinkManager value={value} onChange={onChange} />
	))
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Add

describe("LinkManager add", () => {
	it("appends an empty link with the next sortOrder when Add link is clicked", async () => {
		const { latest } = renderLinks([makeLink({ _key: "a", sortOrder: 0 })])
		await user.click(screen.getByRole("button", { name: /add link/i }))

		const next = latest()
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({
			label: "",
			url: "",
			sortOrder: 1,
		})
		expect(typeof next[1]._key).toBe("string")
	})
})

// #endregion

// #region Remove / reindex

describe("LinkManager remove + reindex", () => {
	it("removes the targeted link and compacts sortOrder values", async () => {
		const { latest } = renderLinks([
			makeLink({ _key: "a", label: "Alpha", sortOrder: 0 }),
			makeLink({ _key: "b", label: "Beta", sortOrder: 1 }),
			makeLink({ _key: "c", label: "Charlie", sortOrder: 2 }),
		])
		// The remove control is the last button in each row; click the Beta remove.
		const removeButtons = screen.getAllByRole("button", { name: /remove/i })
		await user.click(removeButtons[1])

		const next = latest()
		expect(next).toHaveLength(2)
		expect(next.map((l) => l.label)).toEqual(["Alpha", "Charlie"])
		// Post-remove, sortOrder must re-start at 0 so dense 0..n-1 is preserved.
		expect(next.map((l) => l.sortOrder)).toEqual([0, 1])
	})
})

// #endregion

// #region Update URL

describe("LinkManager update", () => {
	it("updates only the targeted row's url field", async () => {
		const { latest } = renderLinks([
			makeLink({ _key: "a", url: "https://a.example" }),
			makeLink({ _key: "b", url: "https://b.example" }),
		])
		const urlInputs = screen.getAllByPlaceholderText("https://...")
		await user.type(urlInputs[1], "!")

		expect(latest().map((l) => l.url)).toEqual([
			"https://a.example",
			"https://b.example!",
		])
	})
})

// #endregion
