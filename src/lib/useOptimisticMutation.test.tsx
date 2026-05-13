import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	type MutateResult,
	useOptimisticMutation,
} from "./useOptimisticMutation"

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	})
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("useOptimisticMutation — success path", () => {
	it("returns { ok: true } on a 2xx response and does not call onRevert", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue(new Response(null, { status: 200 }))
		const onRevert = vi.fn()

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		let outcome: { ok: boolean } | undefined
		await act(async () => {
			outcome = await result.current.mutate({ x: 1 }, { onRevert })
		})

		expect(outcome).toEqual({ ok: true })
		expect(onRevert).not.toHaveBeenCalled()
		expect(result.current.error).toBeNull()
		expect(result.current.isSaving).toBe(false)
	})

	it("clears any prior error on a successful mutate", async () => {
		const fetchMock = vi.fn()
		global.fetch = fetchMock

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		// First call fails to set an error.
		fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }))
		await act(async () => {
			await result.current.mutate({ x: 1 }, { onRevert: vi.fn() })
		})
		expect(result.current.error).toMatch(/boom/)

		// Second call succeeds — error must clear.
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
		await act(async () => {
			await result.current.mutate({ x: 2 }, { onRevert: vi.fn() })
		})
		expect(result.current.error).toBeNull()
	})
})

describe("useOptimisticMutation — failure paths", () => {
	it("calls onRevert and surfaces the server message on a non-ok response", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue(jsonResponse(409, { error: "Already taken" }))
		const onRevert = vi.fn()

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		await act(async () => {
			await result.current.mutate({ x: 1 }, { onRevert })
		})

		expect(onRevert).toHaveBeenCalledOnce()
		expect(result.current.error).toBe("Already taken (HTTP 409)")
	})

	it("calls onRevert and surfaces err.message on a thrown rejection", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network down"))
		const onRevert = vi.fn()

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		await act(async () => {
			await result.current.mutate({ x: 1 }, { onRevert })
		})

		expect(onRevert).toHaveBeenCalledOnce()
		expect(result.current.error).toBe("Network down")
	})

	it("falls back when the thrown error has no message", async () => {
		global.fetch = vi.fn().mockRejectedValue("not an Error")
		const onRevert = vi.fn()

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		await act(async () => {
			await result.current.mutate(
				{ x: 1 },
				{ onRevert, errorFallback: "Custom fallback" }
			)
		})

		expect(result.current.error).toBe("Custom fallback")
	})

	it("clears isSaving in the finally block on every path", async () => {
		const fetchMock = vi.fn()
		global.fetch = fetchMock

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		fetchMock.mockResolvedValueOnce(new Response(null, { status: 200 }))
		await act(async () => {
			await result.current.mutate({ x: 1 }, { onRevert: vi.fn() })
		})
		expect(result.current.isSaving).toBe(false)

		fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "boom" }))
		await act(async () => {
			await result.current.mutate({ x: 2 }, { onRevert: vi.fn() })
		})
		expect(result.current.isSaving).toBe(false)

		fetchMock.mockRejectedValueOnce(new Error("boom"))
		await act(async () => {
			await result.current.mutate({ x: 3 }, { onRevert: vi.fn() })
		})
		expect(result.current.isSaving).toBe(false)
	})
})

describe("useOptimisticMutation — abort and supersession", () => {
	it("does not call onRevert when the request is aborted", async () => {
		const abortError = new DOMException(
			"The user aborted a request.",
			"AbortError"
		)
		global.fetch = vi.fn().mockRejectedValue(abortError)
		const onRevert = vi.fn()

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		await act(async () => {
			await result.current.mutate({ x: 1 }, { onRevert })
		})

		expect(onRevert).not.toHaveBeenCalled()
		expect(result.current.error).toBeNull()
	})

	it("aborts the in-flight request when the component unmounts", async () => {
		let capturedSignal: AbortSignal | undefined
		global.fetch = vi.fn().mockImplementation((_url, options) => {
			capturedSignal = options.signal
			return new Promise(() => {})
		})

		const { result, unmount } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		act(() => {
			void result.current.mutate({ x: 1 }, { onRevert: vi.fn() })
		})

		await waitFor(() => expect(capturedSignal).toBeDefined())
		expect(capturedSignal?.aborted).toBe(false)

		unmount()
		expect(capturedSignal?.aborted).toBe(true)
	})

	it("aborts a previous in-flight request when a new mutate fires", async () => {
		const signals: AbortSignal[] = []
		global.fetch = vi.fn().mockImplementation((_url, options) => {
			signals.push(options.signal)
			return new Promise(() => {})
		})

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		act(() => {
			void result.current.mutate({ x: 1 }, { onRevert: vi.fn() })
		})
		await waitFor(() => expect(signals).toHaveLength(1))
		expect(signals[0].aborted).toBe(false)

		act(() => {
			void result.current.mutate({ x: 2 }, { onRevert: vi.fn() })
		})
		await waitFor(() => expect(signals).toHaveLength(2))

		// Older signal must be aborted by the supersession.
		expect(signals[0].aborted).toBe(true)
		expect(signals[1].aborted).toBe(false)
	})

	it("does not call onRevert from a stale non-ok response after a newer mutate started", async () => {
		// Supersession guard: the older request's non-ok branch must not revert
		// the optimistic state that the newer request committed.
		const resolvers: Array<(value: Response) => void> = []
		global.fetch = vi.fn().mockImplementation(() => {
			return new Promise((resolve) => {
				resolvers.push(resolve)
			})
		})

		const onRevert = vi.fn()

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		let firstOutcome: MutateResult | undefined
		act(() => {
			void result.current
				.mutate({ x: 1 }, { onRevert })
				.then((r) => (firstOutcome = r))
		})
		await waitFor(() => expect(resolvers).toHaveLength(1))

		// Start a second mutate before the first resolves — this aborts the first
		// AbortController and makes its `controller` no longer current.
		act(() => {
			void result.current.mutate({ x: 2 }, { onRevert })
		})
		await waitFor(() => expect(resolvers).toHaveLength(2))

		// Now resolve the FIRST request with a non-ok response. The guard must
		// suppress onRevert because the newer controller has taken over.
		await act(async () => {
			resolvers[0](jsonResponse(500, { error: "stale" }))
		})

		// Supersession is now distinct from a genuine failure in the result
		// shape so future callers can decide whether to surface a toast.
		expect(firstOutcome).toEqual({ ok: false, reason: "superseded" })
		expect(onRevert).not.toHaveBeenCalled()
	})
})

describe("useOptimisticMutation — errorFallback plumbing", () => {
	it("uses errorFallback on non-ok when the body has no recognisable error field", async () => {
		// Body is JSON but neither `error: string` nor `error: ZodIssue[]` —
		// `readErrorMessage` returns the fallback + status suffix. Pins the
		// argument plumbing from `mutate({ ...errorFallback })` →
		// `readErrorMessage(response, errorFallback)`.
		global.fetch = vi
			.fn()
			.mockResolvedValue(jsonResponse(500, { unexpected: "shape" }))

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		await act(async () => {
			await result.current.mutate(
				{ x: 1 },
				{ onRevert: vi.fn(), errorFallback: "Custom non-ok fallback" }
			)
		})

		expect(result.current.error).toBe("Custom non-ok fallback (HTTP 500)")
	})

	it("returns { ok: false, reason: 'failure' } on non-ok", async () => {
		// Tightens the failure discriminant so future callers can rely on it
		// for "don't show toast on supersession but do show on failure" UX.
		global.fetch = vi.fn().mockResolvedValue(jsonResponse(500, { error: "x" }))

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		let outcome: MutateResult | undefined
		await act(async () => {
			outcome = await result.current.mutate({ x: 1 }, { onRevert: vi.fn() })
		})

		expect(outcome).toEqual({ ok: false, reason: "failure" })
	})

	it("returns { ok: false, reason: 'failure' } on a thrown non-abort rejection", async () => {
		global.fetch = vi.fn().mockRejectedValue(new Error("Network down"))

		const { result } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		let outcome: MutateResult | undefined
		await act(async () => {
			outcome = await result.current.mutate({ x: 1 }, { onRevert: vi.fn() })
		})

		expect(outcome).toEqual({ ok: false, reason: "failure" })
	})
})

describe("useOptimisticMutation — unmount after fetch resolves", () => {
	it("does not setState after unmount when a non-ok response resolves post-cleanup", async () => {
		// Narrow race: `fetch` resolves non-ok, but the component unmounts
		// before the `await response.json()` inside `readErrorMessage`
		// settles. The unmount cleanup aborts the controller AND nulls
		// abortRef.current. The supersession guard at the top of the non-ok
		// branch (`abortRef.current !== controller`) suppresses onRevert/
		// setError. This pins the absence of "setState on unmounted component"
		// warnings and confirms the guard catches this exact ordering.
		const resolvers: Array<(value: Response) => void> = []
		global.fetch = vi.fn().mockImplementation(() => {
			return new Promise((resolve) => {
				resolvers.push(resolve)
			})
		})

		const onRevert = vi.fn()
		const { result, unmount } = renderHook(() =>
			useOptimisticMutation<{ x: number }>({ url: "/api/test" })
		)

		let outcome: MutateResult | undefined
		act(() => {
			void result.current
				.mutate({ x: 1 }, { onRevert })
				.then((r) => (outcome = r))
		})
		await waitFor(() => expect(resolvers).toHaveLength(1))

		// Unmount BEFORE the response settles. Cleanup aborts the controller.
		unmount()

		// Now resolve the request with a non-ok response. The guard must
		// suppress onRevert + setError because abortRef.current is null after
		// cleanup, so it cannot equal the still-live controller.
		await act(async () => {
			resolvers[0](jsonResponse(500, { error: "stale" }))
		})

		expect(outcome).toEqual({ ok: false, reason: "superseded" })
		expect(onRevert).not.toHaveBeenCalled()
	})
})
