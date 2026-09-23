"use client"

import { useId } from "react"
import {
	collapseWhitespace,
	DESCRIPTION_MAX_CHARS,
} from "@/lib/content/descriptionRules"

interface Props {
	value: string
	onChange: (value: string) => void
	placeholder: string
	isRequired?: boolean
}

/**
 * Whether a description is past the schema's cap, measured the way the schema
 * measures it: after `collapseWhitespace`. The parent form disables Save on it,
 * since the save would only come back as a 400.
 */
export function isDescriptionOverCap(value: string): boolean {
	return storedLength(value) > DESCRIPTION_MAX_CHARS
}

/**
 * The meta description field shared by the post and guide forms, with a counter
 * of the length that gets stored.
 *
 * No `maxLength` on purpose. The browser counts raw text, but the schema counts
 * it after collapsing whitespace, so a pasted paragraph with line breaks near the
 * cap was cut silently although its collapsed form fit. That is the retyping the
 * schema's collapse exists to prevent. The counter shows the collapsed length
 * instead and turns red past the cap.
 */
export default function DescriptionField({
	value,
	onChange,
	placeholder,
	isRequired = false,
}: Props) {
	const inputId = useId()
	const counterId = useId()
	const isOverCap = isDescriptionOverCap(value)

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={inputId} className="text-secondary text-sm font-medium">
				Description
			</label>
			<textarea
				id={inputId}
				required={isRequired}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				rows={3}
				placeholder={placeholder}
				aria-invalid={isOverCap}
				aria-describedby={counterId}
				className="admin-input"
			/>
			<span
				id={counterId}
				className={`self-end text-xs ${isOverCap ? "text-red-500" : "text-secondary"}`}
			>
				{storedLength(value)}/{DESCRIPTION_MAX_CHARS}
				{isOverCap && " · shorten it to save"}
			</span>
		</div>
	)
}

/** The length the schema measures and the database stores. */
function storedLength(value: string): number {
	return collapseWhitespace(value).length
}
