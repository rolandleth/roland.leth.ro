"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { isAbortError } from "@/lib/isAbortError"
import { readErrorMessage } from "@/lib/readErrorMessage"

interface Props {
	projectId: number
	initialIsFeatured: boolean
}

export default function IsFeaturedToggle({
	projectId,
	initialIsFeatured,
}: Props) {
	const router = useRouter()
	const [isFeatured, setIsFeatured] = useState(initialIsFeatured)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Cancel any in-flight PUT on unmount so the response handler doesn't
	// setState after the component is gone, and so navigation aborts the
	// network call instead of letting it race with the next page render.
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		return () => {
			abortRef.current?.abort()
		}
	}, [])

	async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.checked
		setIsFeatured(next)
		setError(null)
		setIsSaving(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch(`/api/admin/projects/${projectId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isFeatured: next }),
				signal: controller.signal,
			})

			if (!response.ok) {
				// Belt-and-suspenders against the abort-races-error path: if a
				// newer toggle has already committed, don't revert that commit
				// to the SSR-snapshot. The `disabled={isSaving}` prop already
				// blocks user-initiated re-toggle while a request is in flight,
				// so this guard is dead code today — kept so a future refactor
				// that lifts the disable doesn't silently re-open the race.
				if (abortRef.current !== controller) {
					return
				}

				// Surface the server's actual error body (e.g. 409 / 413 / 500
				// distinct messages) with the HTTP status suffix appended —
				// matches the `useAdminResource` contract so the admin UI's
				// error surfaces stay consistent across handlers.
				const message = await readErrorMessage(response, "Failed to save")
				setIsFeatured(initialIsFeatured)
				setError(message)

				return
			}

			router.refresh()
		} catch (err) {
			// Aborted on unmount or by a newer toggle — drop the result silently.
			if (isAbortError(err)) {
				return
			}

			// Same belt-and-suspenders guard as the non-ok branch.
			if (abortRef.current !== controller) {
				return
			}

			// A thrown fetch rejection (network down, CORS) would otherwise leave
			// `isSaving=true` forever and block further toggles. Reverting the
			// optimistic update and surfacing the error is the recovery path.
			// Surface `err.message` (matches `ProjectSortOrderInput`) so DevTools
			// users see the underlying cause rather than a generic placeholder.
			setIsFeatured(initialIsFeatured)
			setError(err instanceof Error ? err.message : "Failed to save")
		} finally {
			if (abortRef.current === controller) {
				setIsSaving(false)
			}
		}
	}

	return (
		<div className="flex flex-col gap-1">
			<label className="flex cursor-pointer items-center gap-1">
				<input
					type="checkbox"
					checked={isFeatured}
					disabled={isSaving}
					onChange={handleChange}
					className="accent-accent disabled:opacity-50"
				/>
				<span className="text-secondary text-xs">Featured</span>
			</label>
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</div>
	)
}
