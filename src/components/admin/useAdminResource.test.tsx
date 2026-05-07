import { act, renderHook, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAdminResource } from "./useAdminResource"

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const push = vi.fn()
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({
		push,
		refresh,
	} as unknown as ReturnType<typeof useRouter>)
	return { push, refresh }
}

function mockFetchOk() {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		headers: new Headers(),
		json: () => Promise.resolve({}),
	})
}

function mockFetchError(status: number, body: unknown = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
		status,
		headers: new Headers({ "content-type": "application/json" }),
		json: () => Promise.resolve(body),
	})
}

beforeEach(() => {
	vi.resetAllMocks()
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

	it("skips setState when the consumer unmounts mid-request", async () => {
		// Keep the fetch pending so we can unmount before it resolves. Without
		// the mount guard, the post-fetch `setError`/`setIsSubmitting` would run
		// on an unmounted component and React would warn.
		mockRouter()
		let rejectFetch: ((err: Error) => void) | undefined
		global.fetch = vi.fn().mockImplementation(
			() =>
				new Promise((_resolve, reject) => {
					rejectFetch = reject
				})
		)
		// Suppress + record so we can assert React did NOT log the
		// "state update on an unmounted component" warning. React 18 silently
		// ignores it (no warning), so this assertion mainly documents intent and
		// pins behavior against a future strict-mode regression.
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {})

		const { result, unmount } = renderHook(() =>
			useAdminResource({ resource: "posts", id: null })
		)

		const savePromise = result.current.save({}).catch(() => {})

		unmount()
		// Reject after unmount — the catch block runs against the stale instance.
		rejectFetch?.(new Error("Network error"))
		await savePromise
		// Microtask flush so any post-rejection setState would fire.
		await new Promise((r) => setTimeout(r, 0))

		expect(consoleErrorSpy).not.toHaveBeenCalledWith(
			expect.stringMatching(/unmounted component/)
		)

		consoleErrorSpy.mockRestore()
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
})

// #endregion
