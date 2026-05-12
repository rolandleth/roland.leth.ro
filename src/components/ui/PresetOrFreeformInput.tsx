"use client"

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
	ariaLabel?: string
}

/**
 * Dual-input control that stays in sync with the `value` prop without any
 * internal mirror state: mode is derived from `value` on every render, so
 * external prop changes (form reset, async prefill) flow through cleanly.
 *
 * - `value === ""` → both inputs enabled (user picks a preset or types freely).
 * - `value` matches a preset → dropdown active, text input disabled.
 * - `value` is non-empty & not a preset → text input active, dropdown disabled.
 *
 * The dropdown always exposes a "Freeform…" option so users in preset mode can
 * explicitly switch back by clearing `value` via `onChange("")`.
 */
export default function PresetOrFreeformInput({
	value,
	onChange,
	presets,
	presetLabel = "Select an option…",
	placeholder = "or type freely…",
	id,
	className,
	required = false,
	ariaLabel,
}: Props) {
	const isPreset = value !== "" && presets.includes(value)
	const isFreeform = value !== "" && !isPreset

	function handleDropdownChange(next: string) {
		if (next === FREEFORM_VALUE) {
			onChange("")

			return
		}

		onChange(next)
	}

	const wrapperClassName = ["flex gap-2", className ?? ""]
		.filter((c) => c !== "")
		.join(" ")

	return (
		<div className={wrapperClassName}>
			{/* Differentiate the two controls' accessible names so SR users can
				distinguish the preset dropdown from the freeform input in the
				rotor — the same `ariaLabel` on both made them indistinguishable. */}
			<select
				id={id}
				value={isPreset ? value : ""}
				onChange={(e) => handleDropdownChange(e.target.value)}
				disabled={isFreeform}
				required={required && !isFreeform}
				aria-label={ariaLabel ? `${ariaLabel} (preset)` : undefined}
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
				<option value={FREEFORM_VALUE}>Freeform…</option>
			</select>
			<input
				type="text"
				placeholder={placeholder}
				value={isFreeform ? value : ""}
				onChange={(e) => onChange(e.target.value)}
				disabled={isPreset}
				required={required && !isPreset}
				aria-label={ariaLabel ? `${ariaLabel} (custom)` : undefined}
				className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
			/>
		</div>
	)
}
