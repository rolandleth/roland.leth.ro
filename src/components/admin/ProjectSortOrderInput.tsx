"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useOptimisticMutation } from "@/lib/client/useOptimisticMutation"

interface Props {
	projectId: number
	/** 0-indexed DB position. Rendered to the admin as a 1-indexed value. */
	initialSortOrder: number
	totalCount: number
}

/**
 * Admin-only input for nudging a single project's position. The DB stores
 * `sortOrder` as a dense 0-indexed sequence (`0..totalCount - 1`), but the
 * admin sees it as an ordinal position (`1..totalCount`) — "1" means first,
 * "2" second, etc. Translation happens at this component's boundary: display
 * values are `initialSortOrder + 1`, and the PUT body subtracts 1 before it
 * hits the API.
 */
export default function ProjectSortOrderInput({
	projectId,
	initialSortOrder,
	totalCount,
}: Props) {
	const router = useRouter()
	const [value, setValue] = useState(String(initialSortOrder + 1))
	const { mutate, isSaving, error } = useOptimisticMutation<{
		sortOrder: number
	}>({
		url: `/api/admin/projects/${projectId}`,
	})

	async function handleBlur() {
		// Strict digit-only parse: rejects `"3abc"`, `"3.7"`, `"-5"`, `""`.
		// `parseInt` accepted trailing garbage (`"3abc" → 3`) so a user typing
		// `"3.7"` silently committed `3`. Snap back to the SSR value on any
		// non-integer input.
		const trimmed = value.trim()
		if (!/^\d+$/.test(trimmed)) {
			setValue(String(initialSortOrder + 1))
			return
		}

		const parsed = Number(trimmed)
		const clamped = Math.max(1, Math.min(totalCount, parsed))
		setValue(String(clamped))

		// The input is 1-indexed for humans; the API expects 0-indexed.
		const nextSortOrder = clamped - 1

		if (nextSortOrder === initialSortOrder) {
			return
		}

		const { ok } = await mutate(
			{ sortOrder: nextSortOrder },
			{ onRevert: () => setValue(String(initialSortOrder + 1)) }
		)

		if (ok) {
			router.refresh()
		}
	}

	return (
		<div className="flex flex-col items-center gap-1">
			<input
				type="number"
				aria-label="Project sort order"
				value={value}
				min={1}
				max={totalCount}
				disabled={isSaving}
				onChange={(e) => setValue(e.target.value)}
				onBlur={handleBlur}
				className="border-border bg-background text-primary focus:border-accent w-12 rounded border px-1.5 py-0.5 text-center text-xs transition-colors outline-none disabled:opacity-50"
			/>
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</div>
	)
}
