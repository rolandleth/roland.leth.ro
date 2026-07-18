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

		expect(result.current.isSubmitting).toBe(false)
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
