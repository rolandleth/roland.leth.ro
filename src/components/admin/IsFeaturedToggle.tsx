"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

interface Props {
	projectId: number
	initialIsFeatured: boolean
}

export default function IsFeaturedToggle({ projectId, initialIsFeatured }: Props) {
	const router = useRouter()
	const [isFeatured, setIsFeatured] = useState(initialIsFeatured)
	const [isSaving, setIsSaving] = useState(false)

	async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.checked
		setIsFeatured(next)
		setIsSaving(true)

		const response = await fetch(`/api/admin/projects/${projectId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ isFeatured: next }),
		})

		if (!response.ok) {
			setIsFeatured(initialIsFeatured)
		}

		setIsSaving(false)
		router.refresh()
	}

	return (
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
	)
}
