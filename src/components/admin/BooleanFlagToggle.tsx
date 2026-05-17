"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useOptimisticMutation } from "@/lib/useOptimisticMutation"

interface Props {
	initial: boolean
	url: string
	payloadKey: string
	label: string
}

/**
 * Optimistic boolean checkbox shared by the post-published and
 * project-isFeatured inline admin toggles. Captures the pre-click value
 * before the optimistic commit so a failed save reverts to the value the
 * user actually toggled away from — not the first-render `initial` prop,
 * which becomes stale after the parent re-renders following a successful
 * round-trip + `router.refresh()`.
 */
export default function BooleanFlagToggle({
	initial,
	url,
	payloadKey,
	label,
}: Props) {
	const router = useRouter()
	const [isOn, setIsOn] = useState(initial)
	const { mutate, isSaving, error } = useOptimisticMutation<
		Record<string, boolean>
	>({
		url,
	})

	async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
		const prev = isOn
		const next = e.target.checked
		setIsOn(next)

		const { ok } = await mutate(
			{ [payloadKey]: next },
			{ onRevert: () => setIsOn(prev) }
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
					checked={isOn}
					disabled={isSaving}
					onChange={handleChange}
					className="accent-accent disabled:opacity-50"
				/>
				<span className="text-secondary text-xs">{label}</span>
			</label>
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</div>
	)
}
