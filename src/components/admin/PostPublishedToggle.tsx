"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useOptimisticMutation } from "@/lib/useOptimisticMutation"

interface Props {
	postId: number
	initialPublished: boolean
}

export default function PostPublishedToggle({
	postId,
	initialPublished,
}: Props) {
	const router = useRouter()
	const [isPublished, setIsPublished] = useState(initialPublished)
	const { mutate, isSaving, error } = useOptimisticMutation<{
		published: boolean
	}>({
		url: `/api/admin/posts/${postId}`,
	})

	async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const next = e.target.checked
		setIsPublished(next)

		const { ok } = await mutate(
			{ published: next },
			{ onRevert: () => setIsPublished(initialPublished) }
		)

		if (ok) {
			router.refresh()
		}
	}

	return (
		<div className="flex flex-col gap-1">
			<label
				className="flex cursor-pointer items-center"
				title={isPublished ? "Published" : "Draft"}
			>
				<input
					type="checkbox"
					checked={isPublished}
					disabled={isSaving}
					onChange={handleChange}
					aria-label="Published"
					className="accent-accent disabled:opacity-50"
				/>
			</label>
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</div>
	)
}
