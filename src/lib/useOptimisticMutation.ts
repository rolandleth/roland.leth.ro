"use client"

import { useEffect, useRef, useState } from "react"
import { isAbortError } from "@/lib/isAbortError"
import { readErrorMessage } from "@/lib/readErrorMessage"

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

interface MutateResult {
	ok: boolean
}

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
					return { ok: false }
				}

				const message = await readErrorMessage(response, errorFallback)
				onRevert()
				setError(message)

				return { ok: false }
			}

			return { ok: true }
		} catch (err) {
			// Aborts are silent: the unmount or a newer mutate already moved on.
			if (isAbortError(err)) {
				return { ok: false }
			}

			// Same belt-and-suspenders guard as the non-ok branch.
			if (abortRef.current !== controller) {
				return { ok: false }
			}

			// A thrown fetch rejection (network down, CORS) would otherwise
			// leave `isSaving=true` forever and block further mutations.
			// Reverting and surfacing `err.message` is the recovery path.
			onRevert()
			setError(err instanceof Error ? err.message : errorFallback)

			return { ok: false }
		} finally {
			if (abortRef.current === controller) {
				setIsSaving(false)
			}
		}
	}

	return { mutate, isSaving, error }
}
