"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

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

	async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.checked
		setIsFeatured(next)
		setError(null)
		setIsSaving(true)

		try {
			const response = await fetch(`/api/admin/projects/${projectId}`, {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ isFeatured: next }),
			})

			if (!response.ok) {
				setIsFeatured(initialIsFeatured)
				setError("Failed to save")

				return
			}

			router.refresh()
		} catch {
			// A thrown fetch rejection (network down, CORS, abort) would otherwise
			// leave `isSaving=true` forever and block further toggles. Reverting
			// the optimistic update and surfacing the error is the recovery path.
			setIsFeatured(initialIsFeatured)
			setError("Failed to save")
		} finally {
			setIsSaving(false)
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
			{error && <p className="text-xs text-red-500">{error}</p>}
		</div>
	)
}
