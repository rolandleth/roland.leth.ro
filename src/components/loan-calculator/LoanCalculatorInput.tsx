type Props = {
	label: string
	description?: string
	type?: "number" | "checkbox"
	value: number | boolean
	onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
	className?: string
}

export default function LoanCalculatorInput({
	label,
	description,
	type = "number",
	value,
	onChange,
	className,
}: Props) {
	return (
		<div className={className}>
			<div className="grid grid-cols-2 gap-5">
				<span className="text-sm font-medium">{label}</span>

				{type === "checkbox" ? (
					<input
						type="checkbox"
						checked={value as boolean}
						onChange={onChange}
						className="accent-accent size-4 cursor-pointer self-center justify-self-end"
					/>
				) : (
					<input
						type="number"
						value={value as number}
						onChange={onChange}
						className="border-border text-primary focus:border-accent [appearance:textfield] border-b bg-transparent pb-0.5 text-right text-sm transition-colors duration-200 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
					/>
				)}
			</div>

			{description && (
				<p className="text-secondary mt-1 text-xs">{description}</p>
			)}
		</div>
	)
}
