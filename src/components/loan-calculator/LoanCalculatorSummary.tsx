import { formatNumber } from "@/lib/loanCalculator"
import type { ComputeReturn } from "@/lib/loanCalculator"

type Color = "positive" | "negative" | "neutral"

type RowProps = {
	label: string
	value: string
	color?: Color
	/** Adds top margin to visually separate groups. */
	isGroupStart?: boolean
	isBold?: boolean
}

function colorClass(color: Color): string {
	switch (color) {
		case "positive":
			return "text-[coral]"
		case "negative":
			return "text-[lightseagreen]"
		case "neutral":
			return "text-primary"
	}
}

function Row({
	label,
	value,
	color = "neutral",
	isGroupStart,
	isBold,
}: RowProps) {
	const cls = `${colorClass(color)} ${isBold ? "font-semibold text-base" : "text-sm"} ${isGroupStart ? "mt-3" : ""}`

	return (
		<div className="grid grid-cols-[auto_1fr] gap-4">
			<span className={cls}>{label}</span>
			<span className={`${cls} text-right`}>{value}</span>
		</div>
	)
}

type Props = {
	values: ComputeReturn
	/** When true, colors indicate whether the difference is better/worse. */
	isComparison?: boolean
}

export default function LoanCalculatorSummary({
	values,
	isComparison = false,
}: Props) {
	const colorFor = (value: number, isInverse: boolean = false): Color => {
		if (value === 0 || !isComparison) {
			return "neutral"
		}

		// A negative difference in "time saved" means you paid off faster — that's good.
		return value < 0 || isInverse ? "negative" : "positive"
	}

	const showActualMonthly =
		isComparison || values.actualMonthlyPayment !== values.baseMonthlyPayment
	const showExtraPayments =
		values.actualMonthlyPaymentWithExtra !== values.actualMonthlyPayment

	return (
		<div className="grid gap-1">
			<Row
				label={showActualMonthly ? "Base monthly rate" : "Monthly rate"}
				value={formatNumber(values.baseMonthlyPayment)}
				color={colorFor(values.baseMonthlyPayment)}
			/>

			{showActualMonthly && (
				<Row
					label="Actual monthly rate"
					value={formatNumber(values.actualMonthlyPayment)}
					color={colorFor(values.actualMonthlyPayment)}
				/>
			)}

			{showExtraPayments && (
				<>
					<Row
						label="Monthly rate with extra"
						value={formatNumber(values.actualMonthlyPaymentWithExtra)}
						color={colorFor(values.actualMonthlyPayment)}
						isGroupStart
					/>
					<Row
						label="Extra payments"
						value={formatNumber(values.numberOfPaidExtraPayments, 0)}
						color={colorFor(values.numberOfPaidExtraPayments)}
					/>
					<Row
						label="Total extra payment"
						value={formatNumber(values.valueOfPaidExtraPayments)}
						color={colorFor(values.valueOfPaidExtraPayments)}
					/>
				</>
			)}

			{values.repayDurationDifference > 0 && (
				<>
					<Row
						label="Loan fulfilled in"
						value={`${formatNumber(values.durationOfRepay, 0)} months`}
						color={colorFor(values.durationOfRepay)}
						isGroupStart
					/>
					<Row
						label="Fulfilled earlier by"
						value={`${formatNumber(values.repayDurationDifference, 0)} months`}
						color={colorFor(values.repayDurationDifference, true)}
					/>
				</>
			)}

			<Row
				label="Overpay"
				value={`${formatNumber(values.percentageOfOverpay)}%`}
				color={colorFor(values.percentageOfOverpay)}
				isGroupStart
			/>
			<Row
				label="Total interest"
				value={formatNumber(values.totalInterest)}
				color={colorFor(values.totalInterest)}
			/>
			<Row
				label="Total"
				value={formatNumber(values.total)}
				color={colorFor(values.total)}
				isGroupStart
				isBold
			/>
		</div>
	)
}
