import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { BULK_MAX_FILES } from "@/lib/api/schemas"
import {
	mockFetchError,
	mockFetchOk,
	mockRouter,
} from "@/test/mocks/adminRequests"
import { setupUser } from "@/test/user"
import PostBulkImport from "./PostBulkImport"

const user = setupUser()

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

const VALID_NAME = "2026-10-18-0930-A valid post.md"
const INVALID_NAME = "not a dated name.md"

function markdownFile(name: string, content = "# Body"): File {
	return new File([content], name, { type: "text/markdown" })
}

function filesInput(): HTMLInputElement {
	return screen.getByLabelText(/markdown files/i)
}

function submitButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: /import|importing/i })
}

/** The parsed JSON body of the one `fetch` call. */
function sentBody(): { section: string; files: unknown[] } {
	const [, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit]

	return JSON.parse(init.body as string) as {
		section: string
		files: unknown[]
	}
}

let refresh: ReturnType<typeof mockRouter>["refresh"]

beforeEach(() => {
	vi.resetAllMocks()
	;({ refresh } = mockRouter())
	vi.spyOn(console, "warn").mockImplementation(() => undefined)
	vi.spyOn(console, "debug").mockImplementation(() => undefined)
})

// #region Selection

describe("PostBulkImport — selection", () => {
	it("keeps the button disabled until a file is selected", () => {
		render(<PostBulkImport />)

		expect(submitButton()).toBeDisabled()
	})

	it("lists each file with its parse result and counts only the valid ones", async () => {
		render(<PostBulkImport />)

		await user.upload(filesInput(), [
			markdownFile(VALID_NAME),
			markdownFile(INVALID_NAME),
		])

		expect(screen.getByText("1 of 2 ready to import")).toBeInTheDocument()
		expect(
			screen.getByText(/A valid post · 2026-10-18-0930/)
		).toBeInTheDocument()
		expect(
			screen.getByText("Filename must be `yyyy-MM-dd[-HHmm]-Title.md`")
		).toBeInTheDocument()
		expect(submitButton()).toHaveTextContent("Import 1 file")
		expect(submitButton()).toBeEnabled()
	})

	it("keeps the button disabled when no selected file is valid", async () => {
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(INVALID_NAME)])

		expect(submitButton()).toBeDisabled()
	})

	it("says how many files past the cap it left out", async () => {
		render(<PostBulkImport />)
		const files = Array.from({ length: BULK_MAX_FILES + 3 }, (_, index) =>
			markdownFile(`2026-10-18-Post ${index}.md`)
		)

		await user.upload(filesInput(), files)

		expect(
			screen.getByText(
				new RegExp(
					`Selected ${BULK_MAX_FILES + 3} files; importing the first ${BULK_MAX_FILES}`
				)
			)
		).toBeInTheDocument()
		expect(
			screen.getByText(`${BULK_MAX_FILES} of ${BULK_MAX_FILES} ready to import`)
		).toBeInTheDocument()
	})
})

// #endregion

// #region Submit

describe("PostBulkImport — submit", () => {
	it("sends only the valid files, with their contents and the section", async () => {
		mockFetchOk({ created: 1, skipped: [] })
		render(<PostBulkImport />)

		await user.selectOptions(screen.getByLabelText(/section/i), "life")
		await user.upload(filesInput(), [
			markdownFile(VALID_NAME, "Hello"),
			markdownFile(INVALID_NAME, "Ignored"),
		])
		await user.click(submitButton())

		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))
		expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/admin/posts/bulk")
		expect(sentBody()).toEqual({
			section: "life",
			files: [{ filename: VALID_NAME, content: "Hello" }],
		})
	})

	it("shows the result, clears the list and refreshes when it created posts", async () => {
		mockFetchOk({
			created: 2,
			skipped: [{ filename: "2026-10-18-Dupe.md", reason: "Slug taken" }],
		})
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())

		expect(await screen.findByText("Created 2 posts")).toBeInTheDocument()
		expect(screen.getByText("Skipped 1:")).toBeInTheDocument()
		expect(screen.getByText("2026-10-18-Dupe.md")).toBeInTheDocument()
		expect(screen.queryByText(/ready to import/)).not.toBeInTheDocument()
		expect(refresh).toHaveBeenCalledTimes(1)
	})

	it("doesn't refresh when it created nothing", async () => {
		mockFetchOk({ created: 0, skipped: [] })
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())

		expect(await screen.findByText("Created 0 posts")).toBeInTheDocument()
		expect(refresh).not.toHaveBeenCalled()
	})
})

// #endregion

// #region Failures

describe("PostBulkImport — failures", () => {
	it("shows the server's message, keeps the files and re-enables the button", async () => {
		mockFetchError(400, { error: "Too many files" })
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())

		expect(
			await screen.findByText("Too many files (HTTP 400)")
		).toBeInTheDocument()
		expect(screen.getByText("1 of 1 ready to import")).toBeInTheDocument()
		expect(submitButton()).toBeEnabled()
		expect(refresh).not.toHaveBeenCalled()
	})

	it("warns under the posts tag when the request fails", async () => {
		const failure = new TypeError("Failed to fetch")
		global.fetch = vi.fn().mockRejectedValue(failure)
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())

		expect(await screen.findByText("Failed to fetch")).toBeInTheDocument()
		expect(console.warn).toHaveBeenCalledWith(
			"[admin:posts] bulk import failed",
			failure
		)
	})

	it("shows the fallback message for a rejection that isn't an Error", async () => {
		global.fetch = vi.fn().mockRejectedValue("offline")
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())

		expect(
			await screen.findByText("Bulk import failed. Please try again.")
		).toBeInTheDocument()
	})

	it("stays silent for an aborted request", async () => {
		global.fetch = vi
			.fn()
			.mockRejectedValue(new DOMException("Aborted", "AbortError"))
		render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())

		await waitFor(() => expect(submitButton()).toBeEnabled())
		expect(console.warn).not.toHaveBeenCalled()
		expect(screen.queryByRole("alert")).not.toBeInTheDocument()
	})

	it("aborts the request on unmount and only traces a late failure", async () => {
		const pending: { reject?: (reason: unknown) => void } = {}
		let signal: AbortSignal | undefined
		global.fetch = vi.fn((_url: string, init?: RequestInit) => {
			signal = init?.signal ?? undefined

			return new Promise((_resolve, reject) => {
				pending.reject = reject
			})
		}) as typeof fetch
		const { unmount } = render(<PostBulkImport />)

		await user.upload(filesInput(), [markdownFile(VALID_NAME)])
		await user.click(submitButton())
		await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

		unmount()
		pending.reject?.(new TypeError("Failed to fetch"))

		await waitFor(() => expect(console.debug).toHaveBeenCalledTimes(1))
		expect(signal?.aborted).toBe(true)
		expect(console.warn).not.toHaveBeenCalled()
	})
})

// #endregion
