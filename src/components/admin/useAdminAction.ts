"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { isAbortError } from "@/lib/client/isAbortError"

/**
 * A state write deferred until the hook confirms this request is still the
 * latest one. `perform` returns one of these instead of calling setters
 * directly, so a superseded response cannot overwrite newer state — the guard
 * is structural rather than something each call site has to remember.
 */
export type Commit = () => void

export interface AdminAction<A extends string> {
	/** Which action is in flight, or `null`. Drives per-button pending labels. */
	pending: A | null
	isBusy: boolean
	error: string | null
	setError: (message: string | null) => void
	run: (
		action: A,
		perform: (signal: AbortSignal) => Promise<Commit | null>
	) => Promise<void>
}

/**
 * Shared request scaffolding for the admin dashboard panels: pending flag,
 * error state, abort-and-supersede across overlapping clicks, unmount
 * cancellation, and network-error reporting.
 *
 * Extracted because Revalidate and IndexNow had copied the same ~25 lines
 * verbatim, and the copy was inert in both: with every button disabled while
 * `isBusy`, nothing could reach `abort()`. The unmount cleanup here is what
 * makes cancellation real — navigate away mid-request and it's dropped rather
 * than resolving into an unmounted tree.
 *
 * `perform` runs the request and returns a `Commit` thunk holding its state
 * writes; the hook invokes it only if this request is still latest.
 */
export function useAdminAction<A extends string>(options: {
	/** Prefix for console diagnostics, e.g. `[admin:IndexNowPanel]`. */
	logTag: string
	/** Shown when the request never completed (offline, DNS, connection reset). */
	networkErrorMessage: string
}): AdminAction<A> {
	const { logTag, networkErrorMessage } = options

	const [pending, setPending] = useState<A | null>(null)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	// Cancel whatever is in flight when the panel unmounts. Without this the
	// abort path is unreachable, since the buttons disable while a request runs.
	useEffect(() => {
		return () => {
			abortRef.current?.abort()
			abortRef.current = null
		}
	}, [])

	const run = useCallback(
		async (
			action: A,
			perform: (signal: AbortSignal) => Promise<Commit | null>
		): Promise<void> => {
			setError(null)
			setPending(action)

			const controller = new AbortController()
			abortRef.current?.abort()
			abortRef.current = controller

			const isLatest = () => abortRef.current === controller

			try {
				const commit = await perform(controller.signal)

				if (isLatest() && commit) {
					commit()
				}
			} catch (err) {
				if (isAbortError(err) || !isLatest()) {
					return
				}

				// eslint-disable-next-line no-console
				console.warn(`${logTag} request failed`, err)
				setError(networkErrorMessage)
			} finally {
				if (isLatest()) {
					setPending(null)
				}
			}
		},
		[logTag, networkErrorMessage]
	)

	return {
		pending,
		isBusy: pending !== null,
		error,
		setError,
		run,
	}
}
