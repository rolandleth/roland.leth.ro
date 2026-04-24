import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import SectionManager, { type SectionItem } from "./SectionManager"

// MarkdownEditor pulls `@/lib/markdown` which loads the remark/rehype pipeline
// at import. Stub to a plain textarea so these tests focus on SectionManager's
// add/remove/reorder contract, not the markdown parse path.
vi.mock("./MarkdownEditor", () => ({
	default: ({
		value,
		onChange,
	}: {
		value: string
		onChange: (v: string) => void
	}) => (
		<textarea
			data-testid="markdown-editor"
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	),
}))

// ImageUpload renders a file input and a fetch wrapper; stubbed for the same
// reason — we only need to assert SectionManager-level orchestration here.
vi.mock("./ImageUpload", () => ({
	default: ({
		value,
		onChange,
	}: {
		value: string
		onChange: (url: string) => void
	}) => (
		<input
			data-testid="image-upload"
			value={value}
			onChange={(e) => onChange(e.target.value)}
		/>
	),
}))

function makeSection(partial: Partial<SectionItem> = {}): SectionItem {
	return {
		_key: partial._key ?? "k",
		title: partial.title ?? "Overview",
		description: partial.description ?? "Body",
		sortOrder: partial.sortOrder ?? 0,
		images: partial.images ?? [],
	}
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Add

describe("SectionManager add", () => {
	it("appends an empty section with the next sortOrder when Add section is clicked", async () => {
		const existing = [makeSection({ _key: "a", sortOrder: 0 })]
		const onChange = vi.fn()

		render(<SectionManager value={existing} onChange={onChange} />)
		await userEvent.click(screen.getByRole("button", { name: /add section/i }))

		const next = onChange.mock.calls[0][0] as SectionItem[]
		expect(next).toHaveLength(2)
		expect(next[1]).toMatchObject({
			title: "",
			description: "",
			sortOrder: 1,
			images: [],
		})
		expect(typeof next[1]._key).toBe("string")
	})
})

// #endregion

// #region Remove / reindex

describe("SectionManager remove + reindex", () => {
	it("removes the targeted section and compacts sortOrder values", async () => {
		const sections = [
			makeSection({ _key: "a", title: "Alpha", sortOrder: 0 }),
			makeSection({ _key: "b", title: "Beta", sortOrder: 1 }),
			makeSection({ _key: "c", title: "Charlie", sortOrder: 2 }),
		]
		const onChange = vi.fn()

		render(<SectionManager value={sections} onChange={onChange} />)
		const removeButtons = screen.getAllByRole("button", { name: /remove/i })
		// Click the middle section's remove.
		await userEvent.click(removeButtons[1])

		const next = onChange.mock.calls[0][0] as SectionItem[]
		expect(next.map((s) => s.title)).toEqual(["Alpha", "Charlie"])
		expect(next.map((s) => s.sortOrder)).toEqual([0, 1])
	})
})

// #endregion

// #region Title update

describe("SectionManager update", () => {
	it("updates only the targeted section's title", async () => {
		const sections = [
			makeSection({ _key: "a", title: "Alpha" }),
			makeSection({ _key: "b", title: "Beta" }),
		]
		const onChange = vi.fn()

		render(<SectionManager value={sections} onChange={onChange} />)
		const titleInputs = screen.getAllByPlaceholderText("Section title")
		await userEvent.type(titleInputs[0], "!")

		const last = onChange.mock.calls[
			onChange.mock.calls.length - 1
		][0] as SectionItem[]
		expect(last[0].title).toBe("Alpha!")
		expect(last[1].title).toBe("Beta")
	})
})

// #endregion
