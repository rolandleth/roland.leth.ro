import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useAdminAction } from "@/components/admin/useAdminAction"

const OPTIONS = {
	logTag: "[test]",
	networkErrorMessage: "network is down",
}

/** A no-op commit, for runs whose state writes don't matter to the assertion. */
const noCommit = () => {}

/** Resolves only when `release()` is called, so two requests can overlap. */
function deferred() {
	let release!: () => void
	const promise = new Promise<undefined>((resolve) => {
		release = () => resolve(undefined)
	})

	return { promise, release }
}

beforeEach(() => {
	vi.spyOn(console, "warn").mockImplementation(() => {})
	vi.spyOn(console, "debug").mockImplementation(() => {})
})

// #region pending lifecycle

describe("useAdminAction pending", () => {
	it("reports the in-flight action and clears it when the request settles", async () => {
		const gate = deferred()
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		expect(result.current.isBusy).toBe(false)

		let inFlight!: Promise<void>
		act(() => {
			inFlight = result.current.run("go", async () => {
				await gate.promise

				return noCommit
			})
		})

		await waitFor(() => expect(result.current.pending).toBe("go"))
		expect(result.current.isBusy).toBe(true)

		await act(async () => {
			gate.release()
			await inFlight
		})

		expect(result.current.pending).toBeNull()
		expect(result.current.isBusy).toBe(false)
	})

	it("clears a previous error when a new run starts", async () => {
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		await act(async () => {
			await result.current.run("go", async () => {
				throw new Error("boom")
			})
		})

		expect(result.current.error).toBe("network is down")

		await act(async () => {
			await result.current.run("go", async () => noCommit)
		})

		expect(result.current.error).toBeNull()
	})

	it("runs the reset callback at the start of a request", async () => {
		// The panels clear their own outcome state through this, so "a new run
		// wipes the last result" can't be forgotten at a call site.
		const reset = vi.fn()
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		await act(async () => {
			await result.current.run("go", async () => noCommit, reset)
		})

		expect(reset).toHaveBeenCalledTimes(1)
	})
})

// #endregion

// #region commit gating

describe("useAdminAction commit", () => {
	it("runs the commit thunk for the latest request", async () => {
		const commit = vi.fn()
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		await act(async () => {
			await result.current.run("go", async () => commit)
		})

		expect(commit).toHaveBeenCalledTimes(1)
	})

	it("skips the commit when perform returns null", async () => {
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		await act(async () => {
			await result.current.run("go", async () => null)
		})

		expect(result.current.pending).toBeNull()
		expect(result.current.error).toBeNull()
	})

	it("does not run a superseded request's commit", async () => {
		// The whole point of the hook: an older response resolving late must not
		// overwrite the newer click's state.
		const first = deferred()
		const firstCommit = vi.fn()
		const secondCommit = vi.fn()
		const { result } = renderHook(() => useAdminAction<"a" | "b">(OPTIONS))

		let firstRun!: Promise<void>
		act(() => {
			firstRun = result.current.run("a", async () => {
				await first.promise

				return firstCommit
			})
		})

		await waitFor(() => expect(result.current.pending).toBe("a"))

		await act(async () => {
			await result.current.run("b", async () => secondCommit)
		})

		expect(secondCommit).toHaveBeenCalledTimes(1)

		await act(async () => {
			first.release()
			await firstRun
		})

		expect(firstCommit).not.toHaveBeenCalled()
	})

	it("leaves pending owned by the newest request when an older one settles", async () => {
		const first = deferred()
		const second = deferred()
		const { result } = renderHook(() => useAdminAction<"a" | "b">(OPTIONS))

		let firstRun!: Promise<void>
		act(() => {
			firstRun = result.current.run("a", async () => {
				await first.promise

				return noCommit
			})
		})

		await waitFor(() => expect(result.current.pending).toBe("a"))

		let secondRun!: Promise<void>
		act(() => {
			secondRun = result.current.run("b", async () => {
				await second.promise

				return noCommit
			})
		})

		await waitFor(() => expect(result.current.pending).toBe("b"))

		// The superseded request finishing must not clear the newer one's flag.
		await act(async () => {
			first.release()
			await firstRun
		})

		expect(result.current.pending).toBe("b")

		await act(async () => {
			second.release()
			await secondRun
		})

		expect(result.current.pending).toBeNull()
	})
})

// #endregion

// #region errors and cancellation

describe("useAdminAction errors", () => {
	it("reports the configured message and logs when a request throws", async () => {
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		await act(async () => {
			await result.current.run("go", async () => {
				throw new Error("connection reset")
			})
		})

		expect(result.current.error).toBe("network is down")
		expect(result.current.pending).toBeNull()
		expect(console.warn).toHaveBeenCalled()
	})

	it("stays silent when the request was aborted", async () => {
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		await act(async () => {
			await result.current.run("go", async () => {
				throw new DOMException("aborted", "AbortError")
			})
		})

		expect(result.current.error).toBeNull()
		expect(console.warn).not.toHaveBeenCalled()
	})

	it("traces a superseded request that fails without surfacing it", async () => {
		// A stale request failing for a real (non-abort) reason must not overwrite
		// the newer request's state — but it shouldn't vanish from the logs either,
		// or an intermittent failure under rapid re-submits is undiagnosable.
		const first = deferred()
		const { result } = renderHook(() => useAdminAction<"a" | "b">(OPTIONS))

		let firstRun!: Promise<void>
		act(() => {
			firstRun = result.current.run("a", async () => {
				await first.promise

				throw new Error("connection reset")
			})
		})

		await waitFor(() => expect(result.current.pending).toBe("a"))

		await act(async () => {
			await result.current.run("b", async () => noCommit)
		})

		await act(async () => {
			first.release()
			await firstRun
		})

		expect(result.current.error).toBeNull()
		expect(console.warn).not.toHaveBeenCalled()
		expect(console.debug).toHaveBeenCalled()
	})

	it("aborts the in-flight request on unmount", async () => {
		// Without this the abort path is unreachable — the buttons disable while
		// busy, so nothing else can supersede a running request.
		const gate = deferred()
		let seen: AbortSignal | null = null
		const { result, unmount } = renderHook(() => useAdminAction<"go">(OPTIONS))

		let inFlight!: Promise<void>
		act(() => {
			inFlight = result.current.run("go", async (signal) => {
				seen = signal
				await gate.promise

				return noCommit
			})
		})

		await waitFor(() => expect(seen).not.toBeNull())

		const signal = seen as unknown as AbortSignal
		expect(signal.aborted).toBe(false)

		unmount()

		expect(signal.aborted).toBe(true)

		await act(async () => {
			gate.release()
			await inFlight
		})
	})

	it("skips the commit when the request resolves after unmount", async () => {
		// The success path must be as unmount-safe as the abort path: a request
		// that settles into an unmounted tree must not run its state writes.
		const gate = deferred()
		const commit = vi.fn()
		const { result, unmount } = renderHook(() => useAdminAction<"go">(OPTIONS))

		let inFlight!: Promise<void>
		act(() => {
			inFlight = result.current.run("go", async () => {
				await gate.promise

				return commit
			})
		})

		await waitFor(() => expect(result.current.pending).toBe("go"))

		unmount()

		await act(async () => {
			gate.release()
			await inFlight
		})

		expect(commit).not.toHaveBeenCalled()
	})

	it("exposes setError so a panel can surface its own message", () => {
		const { result } = renderHook(() => useAdminAction<"go">(OPTIONS))

		act(() => {
			result.current.setError("custom failure")
		})

		expect(result.current.error).toBe("custom failure")
	})
})

// #endregion
