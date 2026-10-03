import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { rememberAdminListUrl } from "@/lib/client/adminListReturn"
import {
	mockFetchError,
	mockFetchOk,
	mockRouter,
} from "@/test/mocks/adminRequests"
import { useAdminResource } from "./useAdminResource"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

beforeEach(() => {
	vi.resetAllMocks()
	window.sessionStorage.clear()
})

// #region save

describe("useAdminResource.save", () => {
	it("POSTs to the collection URL when id is null (create)", async () => {
		mockRouter()
		mockFetchOk()

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({ title: "hi" })
		})

		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/posts")
		expect(options.method).toBe("POST")
	})

	it("PUTs to the resource URL when id is set (edit)", async () => {
		mockRouter()
		mockFetchOk()

		const { result } = renderHook(() =>
			useAdminResource({ resource: "projects", id: 42 })
		)

		await act(async () => {
			await result.current.save({ name: "hi" })
		})

		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/projects/42")
		expect(options.method).toBe("PUT")
	})

	it("navigates to /admin on success", async () => {
		const { push, refresh } = mockRouter()
		mockFetchOk()

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(push).toHaveBeenCalledWith("/admin")
		expect(refresh).toHaveBeenCalled()
	})

	it("keeps isSubmitting true after success, while the navigation runs", async () => {
		// `router.push` resolves before the list renders; a live Save button in
		// that gap re-POSTs the same slug into a 409.
		mockRouter()
		mockFetchOk()

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(result.current.isSubmitting).toBe(true)
	})

	it.each([
		["projects", "/admin?tab=projects"],
		["guides", "/admin?tab=guides"],
		["guide-topics", "/admin?tab=guides"],
	] as const)(
		"returns a %s save to its own tab when no list was remembered",
		async (resource, expectedUrl) => {
			const { push } = mockRouter()
			mockFetchOk()

			const { result } = renderHook(() => useAdminResource({ resource, id: 1 }))

			await act(async () => {
				await result.current.save({})
			})

			expect(push).toHaveBeenCalledWith(expectedUrl)
		}
	)

	it("returns to the remembered list, search and page included", async () => {
		const { push } = mockRouter()
		mockFetchOk()
		rememberAdminListUrl("/admin?tab=projects&q=app&page=3")

		const { result } = renderHook(() =>
			useAdminResource({ resource: "projects", id: 1 })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(push).toHaveBeenCalledWith("/admin?tab=projects&q=app&page=3")
	})

	it("returns a create to the tab's first page, ignoring a remembered search", async () => {
		// The search was typed before the new item existed and would likely hide it.
		const { push } = mockRouter()
		mockFetchOk()
		rememberAdminListUrl("/admin?tab=projects&q=app&page=3")

		const { result } = renderHook(() =>
			useAdminResource({ resource: "projects", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(push).toHaveBeenCalledWith("/admin?tab=projects")
	})

	it("reports hasSucceeded only after a successful save", async () => {
		mockRouter()
		mockFetchOk()

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 1 })
		)

		expect(result.current.hasSucceeded).toBe(false)

		await act(async () => {
			await result.current.save({})
		})

		expect(result.current.hasSucceeded).toBe(true)
	})

	it("keeps hasSucceeded false when the save fails", async () => {
		// The edits are not stored, so the form's unsaved-changes guard must
		// stay armed.
		mockRouter()
		mockFetchError(409, { error: "Slug taken" })

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(result.current.hasSucceeded).toBe(false)
	})

	it("ignores a remembered list on another tab", async () => {
		// Returning to the Posts list after saving a project would hide it.
		const { push } = mockRouter()
		mockFetchOk()
		rememberAdminListUrl("/admin?q=hello&page=2")

		const { result } = renderHook(() =>
			useAdminResource({ resource: "projects", id: 1 })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(push).toHaveBeenCalledWith("/admin?tab=projects")
	})

	it("surfaces the server error message on non-ok responses", async () => {
		mockRouter()
		mockFetchError(400, { error: "Missing title" })

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		// Status suffix is appended by readErrorMessage so the rendered error in
		// the form is debuggable without opening DevTools.
		expect(result.current.error).toBe("Missing title (HTTP 400)")
		expect(result.current.isSubmitting).toBe(false)
	})

	it("shows a network failure, re-enables Save, stays put, and warns with the resource tag", async () => {
		// The server never saw the request, so this warn is the only trace.
		const { push } = mockRouter()
		const networkError = new TypeError("Failed to fetch")
		global.fetch = vi.fn().mockRejectedValue(networkError)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "guides", id: 4 })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(result.current.error).toBe("Failed to fetch")
		expect(result.current.isSubmitting).toBe(false)
		expect(result.current.hasSucceeded).toBe(false)
		expect(push).not.toHaveBeenCalled()
		expect(console.warn).toHaveBeenCalledWith(
			"[admin:guides] save failed",
			networkError
		)
	})

	it("falls back to the generic message for a rejection that isn't an Error", async () => {
		mockRouter()
		global.fetch = vi.fn().mockRejectedValue("offline")

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(result.current.error).toBe("Something went wrong. Please try again.")
	})

	it("warns on a failed HTTP response too", async () => {
		mockRouter()
		mockFetchError(409, { error: "Slug taken" })

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(console.warn).toHaveBeenCalledWith(
			"[admin:posts] save failed",
			expect.objectContaining({ message: "Slug taken (HTTP 409)" })
		)
	})

	it("neither shows nor warns about a superseded save's real failure, but traces it", async () => {
		// The first save fails for a real reason after a second one took over;
		// the second owns the UI, so the first must not overwrite its state.
		mockRouter()
		const debug = vi.spyOn(console, "debug").mockImplementation(() => {})
		const rejecters: Array<(reason: unknown) => void> = []
		global.fetch = vi.fn().mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					// Ignore the abort signal, so the first request fails on its
					// own rather than as an AbortError.
					rejecters.push(reject)
				})
		)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		let firstSave: Promise<void> = Promise.resolve()
		await act(async () => {
			firstSave = result.current.save({ n: 1 })
		})
		await act(async () => {
			void result.current.save({ n: 2 })
		})

		const staleError = new Error("Server exploded")
		await act(async () => {
			rejecters[0](staleError)
			await firstSave
		})

		expect(result.current.error).toBeNull()
		expect(result.current.isSubmitting).toBe(true)
		expect(console.warn).not.toHaveBeenCalled()
		expect(debug).toHaveBeenCalledWith(
			"[admin:posts] save superseded request failed",
			staleError
		)
	})

	it("stays silent about an abort", async () => {
		mockRouter()
		global.fetch = vi
			.fn()
			.mockRejectedValue(
				Object.assign(new Error("aborted"), { name: "AbortError" })
			)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.save({})
		})

		expect(result.current.error).toBeNull()
		expect(console.warn).not.toHaveBeenCalled()
	})

	it("keeps the button disabled when a superseded save settles before the latest resolves", async () => {
		// The race: a rapid second save aborts the first's request. The first's
		// `finally` used to reset `isSubmitting` unconditionally, re-enabling the
		// button while the second save was still in flight (double-submit window).
		mockRouter()
		const resolvers: Array<(value: unknown) => void> = []
		global.fetch = vi.fn().mockImplementation(
			(_url: string, init: RequestInit) =>
				new Promise((resolve, reject) => {
					resolvers.push(resolve)
					init.signal?.addEventListener("abort", () => {
						reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
					})
				})
		)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		let firstSave: Promise<void> = Promise.resolve()
		let secondSave: Promise<void> = Promise.resolve()
		await act(async () => {
			firstSave = result.current.save({ n: 1 })
		})
		await act(async () => {
			secondSave = result.current.save({ n: 2 })
		})

		// Let the superseded first save settle (its fetch was aborted by the second).
		await act(async () => {
			await firstSave.catch(() => {})
		})

		// The latest save is still in flight, so the button must stay disabled.
		expect(result.current.isSubmitting).toBe(true)

		await act(async () => {
			resolvers[1]({
				ok: true,
				headers: new Headers(),
				json: () => Promise.resolve({}),
			})
			await secondSave
		})

		// The latest save succeeded, so the flag stays set through the
		// navigation back to the list.
		expect(result.current.isSubmitting).toBe(true)
	})

	it("aborts the in-flight fetch when the consumer unmounts mid-request", async () => {
		// The unmount cleanup calls `abortRef.current?.abort()` so a navigation
		// away mid-PUT does not leave a dangling network call. Earlier the
		// assertion was an indirect check on `console.error` for the "state
		// update on an unmounted component" message — React 18 silently
		// ignores that case, so the assertion couldn't fail. Asserting the
		// AbortController signal directly pins the actual contract.
		mockRouter()
		let capturedSignal: AbortSignal | undefined
		global.fetch = vi.fn().mockImplementation(
			(_url: string, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					capturedSignal = init.signal ?? undefined
					// Reject on abort so the awaited fetch in `useAdminResource`
					// settles after unmount (matches real fetch semantics).
					init.signal?.addEventListener("abort", () => {
						reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
					})
				})
		)

		const { result, unmount } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		const savePromise = result.current.save({}).catch(() => {})

		unmount()
		await savePromise

		expect(capturedSignal).toBeDefined()
		expect(capturedSignal?.aborted).toBe(true)
	})
})

// #endregion

// #region remove

describe("useAdminResource.remove", () => {
	it("no-ops when id is null (create mode)", async () => {
		mockRouter()
		global.fetch = vi.fn()

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("no-ops when the user cancels the confirm prompt", async () => {
		mockRouter()
		global.fetch = vi.fn()
		window.confirm = vi.fn().mockReturnValue(false)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 1 })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("DELETEs and navigates on confirm", async () => {
		const { push } = mockRouter()
		mockFetchOk()
		window.confirm = vi.fn().mockReturnValue(true)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 7 })
		)

		await act(async () => {
			await result.current.remove()
		})

		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/posts/7")
		expect(options.method).toBe("DELETE")
		expect(push).toHaveBeenCalledWith("/admin")
	})

	it("keeps isSubmitting true after a successful delete", async () => {
		// A second Delete click during the navigation would 404.
		mockRouter()
		mockFetchOk()
		window.confirm = vi.fn().mockReturnValue(true)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 7 })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(result.current.isSubmitting).toBe(true)
	})

	it("returns a delete to the remembered list", async () => {
		const { push } = mockRouter()
		mockFetchOk()
		window.confirm = vi.fn().mockReturnValue(true)
		rememberAdminListUrl("/admin?q=draft&page=2")

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 7 })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(push).toHaveBeenCalledWith("/admin?q=draft&page=2")
	})

	it("reports hasSucceeded after a successful delete, not after a failed one", async () => {
		mockRouter()
		window.confirm = vi.fn().mockReturnValue(true)
		mockFetchError(500, { error: "DB offline" })

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 7 })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(result.current.hasSucceeded).toBe(false)

		mockFetchOk()

		await act(async () => {
			await result.current.remove()
		})

		expect(result.current.hasSucceeded).toBe(true)
	})

	it("surfaces the server error message on delete failure", async () => {
		mockRouter()
		mockFetchError(500, { error: "DB offline" })
		window.confirm = vi.fn().mockReturnValue(true)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 1 })
		)

		await act(async () => {
			await result.current.remove()
		})

		await waitFor(() =>
			expect(result.current.error).toBe("DB offline (HTTP 500)")
		)
		expect(result.current.isSubmitting).toBe(false)
	})

	it("shows a network failure on delete, stays put, and warns with the resource tag", async () => {
		const { push } = mockRouter()
		const networkError = new TypeError("Failed to fetch")
		global.fetch = vi.fn().mockRejectedValue(networkError)
		window.confirm = vi.fn().mockReturnValue(true)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "projects", id: 1 })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(result.current.error).toBe("Failed to fetch")
		expect(result.current.isSubmitting).toBe(false)
		expect(push).not.toHaveBeenCalled()
		expect(console.warn).toHaveBeenCalledWith(
			"[admin:projects] delete failed",
			networkError
		)
	})

	it("falls back to the delete message for a rejection that isn't an Error", async () => {
		mockRouter()
		global.fetch = vi.fn().mockRejectedValue("offline")
		window.confirm = vi.fn().mockReturnValue(true)

		const { result } = renderHook(() =>
			useAdminResource({ resource: "posts", id: 1 })
		)

		await act(async () => {
			await result.current.remove()
		})

		expect(result.current.error).toBe("Delete failed. Please try again.")
	})
})

// #endregion
