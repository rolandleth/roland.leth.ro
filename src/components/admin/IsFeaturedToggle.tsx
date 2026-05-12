"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useOptimisticMutation } from "@/lib/useOptimisticMutation"

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
	const { mutate, isSaving, error } = useOptimisticMutation<{
		isFeatured: boolean
	}>({
		url: `/api/admin/projects/${projectId}`,
	})

	async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.checked
		setIsFeatured(next)

		const { ok } = await mutate(
			{ isFeatured: next },
			{ onRevert: () => setIsFeatured(initialIsFeatured) }
		)

		if (ok) {
			router.refresh()
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
