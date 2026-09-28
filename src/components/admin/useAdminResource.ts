"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { adminListUrlFor } from "@/lib/client/adminListReturn"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"
import type { AdminTab } from "@/lib/client/adminPageUrl"

type Resource = "posts" | "projects" | "guides" | "guide-topics"

interface Config {
	/** Matches the `/api/admin/<resource>` route segment exactly. */
	resource: Resource
	id: number | null
}

/** The dashboard tab that lists each resource; topics sit on the Guides tab. */
const RESOURCE_TABS: Record<Resource, AdminTab> = {
	posts: "posts",
	projects: "projects",
	guides: "guides",
	"guide-topics": "guides",
}

interface AdminResource<TPayload> {
	save: (payload: TPayload) => Promise<void>
	remove: () => Promise<void>
	isSubmitting: boolean
	/**
	 * Whether a save or delete succeeded and the form is on its way back to the
	 * list. The form's edits are then stored, so its unsaved-changes guard must
	 * stand down: the list takes one server round trip to render, and a click or
	 * a tab close in that gap would otherwise warn about changes already saved.
	 */
	hasSucceeded: boolean
	error: string | null
}

export function useAdminResource<TPayload>({
	resource,
	id,
}: Config): AdminResource<TPayload> {
	const router = useRouter()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [hasSucceeded, setHasSucceeded] = useState(false)
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

	// Back to the list the admin came from (tab, search and page) when it shows
	// this resource, otherwise to the resource's tab; see `adminListUrlFor`.
	function goBackToAdmin() {
		setHasSucceeded(true)
		router.push(
			adminListUrlFor(RESOURCE_TABS[resource], { isAfterCreate: !isEditing })
		)
		router.refresh()
	}

	async function save(payload: TPayload): Promise<void> {
		setError(null)
		setIsSubmitting(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller
		let isNavigating = false

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

			isNavigating = true
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
			// re-enable the button while the newer one is still running. A
			// successful one keeps it too: `router.push` resolves before the list
			// renders, and a second click in that gap re-POSTs into a 409.
			if (
				!isNavigating &&
				isMountedRef.current &&
				abortRef.current === controller
			) {
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
		let isNavigating = false

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

			isNavigating = true
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
			// re-enable the button while the newer one is still running. A
			// successful one keeps it, as in `save`: a second click would 404.
			if (
				!isNavigating &&
				isMountedRef.current &&
				abortRef.current === controller
			) {
				setIsSubmitting(false)
			}
		}
	}

	return { save, remove, isSubmitting, hasSucceeded, error }
}
