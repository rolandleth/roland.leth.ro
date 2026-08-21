"use client"

import { useEffect, useRef, useState } from "react"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"
import { errorDetails } from "@/lib/utils/errorMessage"

interface Config {
	url: string
	method?: "PUT" | "POST" | "DELETE"
}

interface MutateOptions {
	/**
	 * Called when the request fails (non-ok response or thrown rejection) AND
	 * this controller is still the latest. Caller uses it to revert the
	 * optimistic state it committed before calling `mutate`.
	 */
	onRevert: () => void
	/**
	 * User-facing fallback message when the server provides no parseable body
	 * (or when a thrown error has no `.message`).
	 */
	errorFallback?: string
}

/**
 * Discriminated outcome of a `mutate` call:
 * - `{ ok: true }` — the server returned 2xx and this controller is still
 *   the latest; the caller may run success-path side effects.
 * - `{ ok: false, reason: "failure" }` — the server returned non-ok OR fetch
 *   threw (network/CORS). `onRevert` already ran and `error` is set.
 * - `{ ok: false, reason: "superseded" }` — a newer `mutate` started before
 *   this one resolved (or the component unmounted). `onRevert` did NOT run,
 *   `error` was NOT set; the caller should treat this as "no-op, the newer
 *   call owns the outcome" and avoid surfacing a toast / refreshing state.
 *
 * Today's two callers don't differentiate the failure modes, but the
 * discriminant lands so future consumers (e.g. one that wants to skip a
 * post-mutate `router.refresh()` on supersession) don't pay the extraction
 * tax twice.
 */
export type MutateResult =
	{ ok: true } | { ok: false; reason: "failure" | "superseded" }

/**
 * Optimistic-mutation hook for inline admin widgets that commit their
 * next-state value before the network resolves (`IsFeaturedToggle`,
 * `ProjectSortOrderInput`).
 *
 * Handles abort-on-unmount, abort-on-supersession, the `isAbortError` guard,
 * and the controller-vs-abort guards on revert + finally so each call site
 * doesn't re-implement ~40 LOC of plumbing.
 *
 * Caller responsibilities:
 * - Commit the optimistic value BEFORE calling `mutate`.
 * - Revert that value inside the `onRevert` callback.
 * - Own success-path side effects (e.g. `router.refresh()`) by checking the
 *   returned `ok`.
 */
export function useOptimisticMutation<TPayload>({
	url,
	method = "PUT",
}: Config) {
	const abortRef = useRef<AbortController | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		return () => {
			abortRef.current?.abort()
			// Null the ref AS WELL as aborting: in the narrow window where
			// `fetch` resolves before the abort signal is observed (short
			// buffered bodies, or a mock that ignores signals), the non-ok
			// branch's `abortRef.current !== controller` guard would otherwise
			// be FALSE and the branch would `setState` on an unmounted
			// component. Nulling makes the guard correct for every
			// post-unmount continuation, not just the abort-rejection path.
			abortRef.current = null
		}
	}, [])

	async function mutate(
		payload: TPayload,
		{ onRevert, errorFallback = "Failed to save" }: MutateOptions
	): Promise<MutateResult> {
		setError(null)
		setIsSaving(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: controller.signal,
			})

			if (!response.ok) {
				// Belt-and-suspenders: if a newer mutate has already committed,
				// don't revert that commit to the SSR-snapshot. Callers'
				// `disabled={isSaving}` blocks user-initiated re-fire, so this
				// guard is dead code today — kept for future refactors that lift
				// the disable, and for the parent-prop-drift case where
				// `router.refresh()` re-renders with new initial values.
				if (abortRef.current !== controller) {
					return { ok: false, reason: "superseded" }
				}

				const message = await readErrorMessage(response, errorFallback)
				// Log the failure so a flaky-network or 5xx-storm leaves a
				// breadcrumb in devtools. The UI also surfaces `message`, but
				// users won't open the console; tail-the-log debugging will.
				// eslint-disable-next-line no-console
				console.error("[useOptimisticMutation] non-ok response", {
					url,
					status: response.status,
					message,
				})
				onRevert()
				setError(message)

				return { ok: false, reason: "failure" }
			}

			return { ok: true }
		} catch (err) {
			// Aborts are silent: the unmount or a newer mutate already moved on.
			if (isAbortError(err)) {
				return { ok: false, reason: "superseded" }
			}

			// Same belt-and-suspenders guard as the non-ok branch.
			if (abortRef.current !== controller) {
				return { ok: false, reason: "superseded" }
			}

			// A thrown fetch rejection (network down, CORS) would otherwise
			// leave `isSaving=true` forever and block further mutations.
			// Reverting and surfacing `err.message` is the recovery path.
			//
			// `errorDetails` rather than the raw `err`: `Error.message`/`.stack`
			// live on non-enumerable properties, so nesting the Error itself here
			// would serialize to `{}` under any pipeline that JSON.stringifies
			// before forwarding a log — including a client-side error reporter.
			// eslint-disable-next-line no-console
			console.error("[useOptimisticMutation] fetch threw", {
				url,
				error: errorDetails(err),
			})
			onRevert()
			setError(err instanceof Error ? err.message : errorFallback)

			return { ok: false, reason: "failure" }
		} finally {
			if (abortRef.current === controller) {
				setIsSaving(false)
			}
		}
	}

	return { mutate, isSaving, error }
}
