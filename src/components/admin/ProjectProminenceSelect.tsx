"use client"

import { useRouter } from "next/navigation"
import { useId, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import {
	DISCONTINUED_PLACEMENT_HINT,
	PROMINENCE_LABELS,
	PROMINENCE_OPTIONS,
} from "@/components/admin/projectPlacement"
import { useOptimisticMutation } from "@/lib/client/useOptimisticMutation"
import { isPlacementOverridden } from "@/lib/utils/projectsGallery"
import type { ProjectProminence } from "@/generated/prisma/enums"

interface Props {
	projectId: number
	initial: ProjectProminence
	/** Read-only here; it decides whether the override hint shows. */
	isDiscontinued: boolean
}

/**
 * Optimistic prominence picker on each admin project card. Like
 * `BooleanFlagToggle`, it captures the pre-change value before the optimistic
 * commit, so a failed save reverts to the level the user changed away from,
 * not the first-render `initial`, which goes stale after a successful save
 * and `router.refresh()`. The refresh moves the card into its new group.
 *
 * On a discontinued project whose level would place it elsewhere, a hint under
 * the picker says the level doesn't apply, as the form's does.
 */
export default function ProjectProminenceSelect({
	projectId,
	initial,
	isDiscontinued,
}: Props) {
	const router = useRouter()
	const hintId = useId()
	const [prominence, setProminence] = useState(initial)
	const isHintShown = isPlacementOverridden({ prominence, isDiscontinued })
	const { mutate, isSaving, error } = useOptimisticMutation<{
		prominence: ProjectProminence
	}>({
		url: `/api/admin/projects/${projectId}`,
	})

	async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
		const prev = prominence
		const next = e.target.value as ProjectProminence
		setProminence(next)

		const { ok } = await mutate(
			{ prominence: next },
			{ onRevert: () => setProminence(prev) }
		)

		if (ok) {
			router.refresh()
		}
	}

	return (
		<div className="flex flex-col gap-1">
			<select
				value={prominence}
				disabled={isSaving}
				onChange={handleChange}
				aria-label="Prominence"
				aria-describedby={isHintShown ? hintId : undefined}
				className="text-secondary bg-transparent text-xs disabled:opacity-50"
			>
				{PROMINENCE_OPTIONS.map((value) => (
					<option key={value} value={value}>
						{PROMINENCE_LABELS[value]}
					</option>
				))}
			</select>
			{isHintShown && (
				<p id={hintId} className="text-secondary text-xs">
					{DISCONTINUED_PLACEMENT_HINT}
				</p>
			)}
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</div>
	)
}
