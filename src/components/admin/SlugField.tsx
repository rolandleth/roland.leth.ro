"use client"

import { useId } from "react"
import {
	CANONICAL_SLUG_MESSAGE,
	CANONICAL_SLUG_SOURCE,
	SLUG_MAX_LENGTH,
} from "@/lib/utils/format"

interface Props {
	value: string
	/** Absent for a locked field. */
	onChange?: (slug: string) => void
	/** One line under the field: where the slug comes from and whether it can change. */
	hint: string
	placeholder?: string
	/**
	 * Read-only, for a slug that is fixed after creation (projects, posts). The
	 * field stays visible so the author can see the URL the item lives at.
	 */
	isLocked?: boolean
}

/**
 * The slug input every admin editor shares. The browser checks the same
 * canonical form the schemas enforce (`pattern` + `maxLength`), so a bad slug
 * is caught at the field with the rule in its tooltip instead of as a 400 after
 * Save. A read-only input is exempt from constraint validation, so a locked
 * legacy slug that predates the rule never blocks a save.
 */
export default function SlugField({
	value,
	onChange,
	hint,
	placeholder,
	isLocked = false,
}: Props) {
	const hintId = useId()

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor="slug" className="text-secondary text-sm font-medium">
				Slug
			</label>
			<input
				id="slug"
				type="text"
				value={value}
				onChange={(e) => onChange?.(e.target.value)}
				readOnly={isLocked}
				required={!isLocked}
				pattern={CANONICAL_SLUG_SOURCE}
				maxLength={SLUG_MAX_LENGTH}
				title={CANONICAL_SLUG_MESSAGE}
				placeholder={placeholder}
				aria-describedby={hintId}
				className="admin-input read-only:text-secondary font-mono read-only:cursor-default"
			/>
			<p id={hintId} className="text-secondary text-xs">
				{hint}
			</p>
		</div>
	)
}
