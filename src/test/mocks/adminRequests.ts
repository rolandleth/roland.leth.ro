import { useRouter } from "next/navigation"
import { vi } from "vitest"

/**
 * Shared router and `fetch` stubs for tests of the admin forms and the hooks
 * behind them. The calling test file must mock `next/navigation` itself —
 * `vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))` — because
 * `vi.mock` is hoisted per file; this module's `useRouter` import then resolves
 * to that mock.
 */

/** Stubs `useRouter` and returns its `push` / `refresh` spies. */
export function mockRouter() {
	const push = vi.fn()
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({
		push,
		refresh,
	} as unknown as ReturnType<typeof useRouter>)

	return { push, refresh }
}

/** Stubs `fetch` with a 200 JSON response. */
export function mockFetchOk(body: unknown = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		headers: new Headers({ "content-type": "application/json" }),
		json: () => Promise.resolve(body),
	})
}

/**
 * Stubs `fetch` with a failed JSON response. The status is required:
 * `readErrorMessage` appends it to the message the form shows, so a stub
 * without one renders an `(HTTP undefined)` no real response can produce.
 */
export function mockFetchError(status: number, body: unknown = {}) {
	global.fetch = vi.fn().mockResolvedValue({
		ok: false,
		status,
		headers: new Headers({ "content-type": "application/json" }),
		json: () => Promise.resolve(body),
	})
}
