"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { readErrorMessage } from "@/components/admin/useAdminResource"
import { isAbortError } from "@/lib/isAbortError"

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

			// A thrown fetch rejection (network down, CORS) would otherwise leave
			// `isSaving=true` forever and block further toggles. Reverting the
			// optimistic update and surfacing the error is the recovery path.
			setIsFeatured(initialIsFeatured)
			setError("Failed to save")
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
