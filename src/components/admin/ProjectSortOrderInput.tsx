"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

interface Props {
	projectId: number
	initialSortOrder: number
	totalCount: number
}

export default function ProjectSortOrderInput({
	projectId,
	initialSortOrder,
	totalCount,
}: Props) {
	const router = useRouter()
	const [value, setValue] = useState(String(initialSortOrder))
	const [isSaving, setIsSaving] = useState(false)

	async function handleBlur() {
		const parsed = parseInt(value, 10)

		if (isNaN(parsed)) {
			setValue(String(initialSortOrder))
			return
		}

		const clamped = Math.max(1, Math.min(totalCount, parsed))
		setValue(String(clamped))

		if (clamped === initialSortOrder) {
			return
		}

		setIsSaving(true)

		const response = await fetch(`/api/admin/projects/${projectId}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ sortOrder: clamped }),
		})

		if (!response.ok) {
			setValue(String(initialSortOrder))
			setIsSaving(false)
			return
		}

		router.refresh()
		setIsSaving(false)
	}

	return (
		<input
			type="number"
			value={value}
			min={1}
			max={totalCount}
			disabled={isSaving}
			onChange={(e) => setValue(e.target.value)}
			onBlur={handleBlur}
			className="border-border bg-background text-primary focus:border-accent w-12 rounded border px-1.5 py-0.5 text-center text-xs transition-colors outline-none disabled:opacity-50"
		/>
	)
}
