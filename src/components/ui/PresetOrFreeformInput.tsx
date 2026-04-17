"use client"

import { useState } from "react"

export const FREEFORM_VALUE = "__freeform__"

interface Props {
	value: string
	onChange: (value: string) => void
	presets: readonly string[]
	presetLabel?: string
	placeholder?: string
	id?: string
	className?: string
	required?: boolean
}

export default function PresetOrFreeformInput({
	value,
	onChange,
	presets,
	presetLabel = "Select an option…",
	placeholder = "or type freely…",
	id,
	className,
	required = false,
}: Props) {
	const isPreset = presets.includes(value)
	const [dropdownValue, setDropdownValue] = useState(isPreset ? value : "")
	const [freeformValue, setFreeformValue] = useState(isPreset ? "" : value)

	function handleDropdownChange(next: string) {
		if (next === FREEFORM_VALUE) {
			setDropdownValue("")
			onChange(freeformValue)

			return
		}

		setDropdownValue(next)
		onChange(next)
	}

	function handleFreeformChange(next: string) {
		setFreeformValue(next)
		onChange(next)
	}

	const wrapperClassName = ["flex gap-2", className ?? ""]
		.filter((c) => c !== "")
		.join(" ")

	return (
		<div className={wrapperClassName}>
			<select
				id={id}
				value={dropdownValue}
				onChange={(e) => handleDropdownChange(e.target.value)}
				disabled={freeformValue !== ""}
				required={required && freeformValue === ""}
				className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
			>
				<option value="" disabled>
					{presetLabel}
				</option>
				{presets.map((option) => (
					<option key={option} value={option}>
						{option}
					</option>
				))}
				{dropdownValue !== "" && (
					<option value={FREEFORM_VALUE}>Freeform…</option>
				)}
			</select>
			<input
				type="text"
				placeholder={placeholder}
				value={freeformValue}
				onChange={(e) => handleFreeformChange(e.target.value)}
				disabled={dropdownValue !== ""}
				required={required && dropdownValue === ""}
				className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
			/>
		</div>
	)
}
