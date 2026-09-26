"use client"

import { useId, useState } from "react"
import { parseLoanField, type LoanFieldRule } from "@/lib/utils/loanCalculator"

type SharedProps = {
	label: string
	description?: string
	className?: string
}

type Props = SharedProps &
	(
		| {
				type: "checkbox"
				value: boolean
				onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
		  }
		| {
				type?: "number"
				value: number
				rule: LoanFieldRule
				/** Called only with a value that satisfies `rule`. */
				onChange: (value: number) => void
		  }
	)

export default function LoanCalculatorInput(props: Props) {
	const { label, description, className } = props
	const descriptionId = useId()

	// Implicit label/input association by nesting the input inside the label —
	// screen readers announce the label on focus without needing matching ids.
	return (
		<div className={className}>
			{props.type === "checkbox" ? (
				<label className="grid grid-cols-2 gap-5">
					<span className="text-sm font-medium">{label}</span>
					<input
						type="checkbox"
						checked={props.value}
						onChange={props.onChange}
						aria-describedby={description ? descriptionId : undefined}
						className="accent-accent size-4 cursor-pointer self-center justify-self-end"
					/>
				</label>
			) : (
				<NumberField
					label={label}
					value={props.value}
					rule={props.rule}
					onChange={props.onChange}
					descriptionId={description ? descriptionId : undefined}
				/>
			)}

			{description && (
				<p id={descriptionId} className="text-secondary mt-1 text-xs">
					{description}
				</p>
			)}
		</div>
	)
}

/**
 * A number input that owns its draft text, so the field can hold text the
 * calculator can't use yet: empty while retyping, "0" on the way to "05", or
 * an out-of-range value. Only a value that passes `rule` reaches `onChange`;
 * anything else shows a message under the field and leaves the results on the
 * last valid input.
 */
function NumberField({
	label,
	value,
	rule,
	onChange,
	descriptionId,
}: {
	label: string
	value: number
	rule: LoanFieldRule
	onChange: (value: number) => void
	descriptionId?: string
}) {
	const errorId = useId()
	const [draft, setDraft] = useState(String(value))
	const [syncedValue, setSyncedValue] = useState(value)

	// The parent can change `value` on its own (the extra-payments toggle resets
	// its fields). Adopt it during render, per React's "adjusting state when a
	// prop changes" pattern, unless the draft already means that number — which
	// keeps "05" as typed instead of rewriting it to "5".
	if (value !== syncedValue) {
		setSyncedValue(value)

		if (parseLoanField(draft, rule).value !== value) {
			setDraft(String(value))
		}
	}

	const { error } = parseLoanField(draft, rule)
	const describedBy =
		[descriptionId, error ? errorId : null].filter(Boolean).join(" ") ||
		undefined

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const nextDraft = e.target.value
		setDraft(nextDraft)

		const parsed = parseLoanField(nextDraft, rule)

		if (parsed.value != null && parsed.value !== value) {
			setSyncedValue(parsed.value)
			onChange(parsed.value)
		}
	}

	return (
		<>
			<label className="grid grid-cols-2 gap-5">
				<span className="text-sm font-medium">{label}</span>
				<input
					type="number"
					value={draft}
					onChange={handleChange}
					min={rule.min}
					max={rule.max}
					step={rule.isWholeNumber ? 1 : "any"}
					aria-invalid={error != null}
					aria-describedby={describedBy}
					className="border-border text-primary focus:border-accent aria-[invalid=true]:border-red-500[&::-webkit-inner-spin-button]:appearance-none [appearance:textfield] border-b bg-transparent pb-0.5 text-right text-sm transition-colors duration-200 outline-none [&::-webkit-outer-spin-button]:appearance-none"
				/>
			</label>

			{error && (
				<p id={errorId} className="mt-1 text-right text-xs text-red-500">
					{error}
				</p>
			)}
		</>
	)
}
