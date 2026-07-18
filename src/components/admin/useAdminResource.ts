"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

interface Config {
	/** Matches the `/api/admin/<resource>` route segment exactly. */
	resource: "posts" | "projects" | "guides" | "guide-topics"
	id: number | null
}

interface AdminResource<TPayload> {
	save: (payload: TPayload) => Promise<void>
	remove: () => Promise<void>
	isSubmitting: boolean
	error: string | null
}

export function useAdminResource<TPayload>({
	resource,
	id,
}: Config): AdminResource<TPayload> {
	const router = useRouter()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Gates `setState` calls that fire after the caller has unmounted (e.g. the
	// admin navigated away while a PUT was in flight). Without this the React
	// dev-time warning is the only signal that the handler is updating a dead
	// component.
	const isMountedRef = useRef(true)
	// Cancels any in-flight save/remove on unmount so the network call doesn't
	// outlive the form (relevant when the admin navigates away mid-PUT).
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		isMountedRef.current = true

		return () => {
			isMountedRef.current = false
			abortRef.current?.abort()
		}
	}, [])

	const isEditing = id !== null

	function goBackToAdmin() {
		router.push("/admin")
		router.refresh()
	}

	async function save(payload: TPayload): Promise<void> {
		setError(null)
		setIsSubmitting(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const url = isEditing
				? `/api/admin/${resource}/${id}`
				: `/api/admin/${resource}`
			const method = isEditing ? "PUT" : "POST"

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: controller.signal,
			})

			// A newer save/remove superseded this one while the request was in
			// flight — let the newer one own the outcome (navigation, error, and the
			// submitting flag). Without this, a stale response could navigate away or
			// re-enable the button under the in-flight request.
			if (abortRef.current !== controller) {
				return
			}

			if (!response.ok) {
				const message = await readErrorMessage(
					response,
					"Something went wrong. Please try again."
				)

				if (abortRef.current !== controller) {
					return
				}

				throw new Error(message)
			}

			goBackToAdmin()
		} catch (err) {
			if (!isMountedRef.current || abortRef.current !== controller) {
				return
			}

			// Aborts are silent: the unmount or a newer save already moved on.
			if (isAbortError(err)) {
				return
			}

			setError(
				err instanceof Error
					? err.message
					: "Something went wrong. Please try again."
			)
		} finally {
			// Only the latest request clears the flag; a superseded save must not
			// re-enable the button while the newer one is still running.
			if (isMountedRef.current && abortRef.current === controller) {
				setIsSubmitting(false)
			}
		}
	}

	async function remove(): Promise<void> {
		if (!isEditing) {
			return
		}

		if (!window.confirm("Are you sure? This cannot be undone.")) {
			return
		}

		setError(null)
		setIsSubmitting(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch(`/api/admin/${resource}/${id}`, {
				method: "DELETE",
				signal: controller.signal,
			})

			// Superseded by a newer save/remove — see the note in `save`.
			if (abortRef.current !== controller) {
				return
			}

			if (!response.ok) {
				const message = await readErrorMessage(
					response,
					"Delete failed. Please try again."
				)

				if (abortRef.current !== controller) {
					return
				}

				throw new Error(message)
			}

			goBackToAdmin()
		} catch (err) {
			if (!isMountedRef.current || abortRef.current !== controller) {
				return
			}

			if (isAbortError(err)) {
				return
			}

			setError(
				err instanceof Error ? err.message : "Delete failed. Please try again."
			)
		} finally {
			// Only the latest request clears the flag; a superseded remove must not
			// re-enable the button while the newer one is still running.
			if (isMountedRef.current && abortRef.current === controller) {
				setIsSubmitting(false)
			}
		}
	}

	return { save, remove, isSubmitting, error }
}
