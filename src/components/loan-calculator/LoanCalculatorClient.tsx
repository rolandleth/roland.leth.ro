"use client"

import { useState } from "react"
import computeLoan from "@/lib/loanCalculator"
import LoanCalculatorInput from "./LoanCalculatorInput"
import LoanCalculatorSummary from "./LoanCalculatorSummary"
import type { ComputeParams, ComputeReturn } from "@/lib/loanCalculator"

const DEFAULT_PARAMS: ComputeParams = {
	loan: 500_000,
	additionalCosts: 0,
	additionalMonthlyPayment: 0,
	annualInterestRate: 5.0,
	period: 60,
	extraPayments: {
		limit: 0,
		frequency: 1,
		value: 0,
	},
}

function parseNum(raw: string, fallback: number): number {
	const parsed = parseFloat(raw)
	return isNaN(parsed) ? fallback : parsed
}

function Calculator({
	params,
	onChange,
}: {
	params: ComputeParams
	onChange: (updated: ComputeParams) => void
}) {
	const [isExtraPaymentsEnabled, setIsExtraPaymentsEnabled] = useState(false)
	const results = computeLoan(params)

	const handleExtraPaymentsToggle = (
		e: React.ChangeEvent<HTMLInputElement>
	) => {
		const isChecked = e.target.checked
		setIsExtraPaymentsEnabled(isChecked)

		if (!isChecked) {
			onChange({
				...params,
				extraPayments: { frequency: 1, value: 0, limit: 0 },
			})
		}
	}

	return (
		<div className="flex flex-col gap-3">
			<LoanCalculatorInput
				label="Loan"
				description="The sum you intend to loan."
				value={params.loan}
				onChange={(e) =>
					onChange({ ...params, loan: parseNum(e.target.value, params.loan) })
				}
			/>
			<LoanCalculatorInput
				label="Duration (months)"
				description="The duration of the loan, in months."
				value={params.period}
				onChange={(e) =>
					onChange({
						...params,
						period: parseNum(e.target.value, params.period),
					})
				}
			/>
			<LoanCalculatorInput
				label="Annual interest rate (%)"
				description="The annual interest rate, as a percentage."
				value={params.annualInterestRate}
				onChange={(e) =>
					onChange({
						...params,
						annualInterestRate: parseNum(
							e.target.value,
							params.annualInterestRate
						),
					})
				}
			/>
			<LoanCalculatorInput
				label="Additional costs"
				description="One-time costs, like commissions."
				value={params.additionalCosts}
				onChange={(e) =>
					onChange({
						...params,
						additionalCosts: parseNum(e.target.value, params.additionalCosts),
					})
				}
			/>
			<LoanCalculatorInput
				label="Monthly extra payment"
				description="A sum you intend to pay extra, each month."
				value={params.additionalMonthlyPayment}
				onChange={(e) =>
					onChange({
						...params,
						additionalMonthlyPayment: parseNum(e.target.value, 0),
					})
				}
			/>
			<LoanCalculatorInput
				label="Occasional extra payments?"
				description="An additional sum you intend to pay extra, every now and then."
				type="checkbox"
				value={isExtraPaymentsEnabled}
				onChange={handleExtraPaymentsToggle}
			/>

			{isExtraPaymentsEnabled && (
				<div className="border-border ml-4 grid gap-3 border-l pl-4">
					<LoanCalculatorInput
						label="Value"
						description="The amount you intend to pay extra."
						value={params.extraPayments.value}
						onChange={(e) =>
							onChange({
								...params,
								extraPayments: {
									...params.extraPayments,
									value: parseNum(e.target.value, params.extraPayments.value),
								},
							})
						}
					/>
					<LoanCalculatorInput
						label="Frequency (months)"
						description="Every how many months. 1 for monthly."
						value={params.extraPayments.frequency}
						onChange={(e) =>
							onChange({
								...params,
								extraPayments: {
									...params.extraPayments,
									frequency: parseNum(
										e.target.value,
										params.extraPayments.frequency
									),
								},
							})
						}
					/>
					<LoanCalculatorInput
						label="Limit"
						description="Total number of extra payments. 0 for unlimited."
						value={params.extraPayments.limit}
						onChange={(e) =>
							onChange({
								...params,
								extraPayments: {
									...params.extraPayments,
									limit: parseNum(e.target.value, params.extraPayments.limit),
								},
							})
						}
					/>
				</div>
			)}

			<div className="border-border mt-auto border-t pt-3">
				<LoanCalculatorSummary values={results} />
			</div>
		</div>
	)
}

function diffResults(
	first: ComputeReturn,
	second: ComputeReturn
): ComputeReturn {
	return Object.fromEntries(
		Object.keys(first).map((k) => {
			const key = k as keyof ComputeReturn
			return [key, second[key] - first[key]]
		})
	) as ComputeReturn
}

export default function LoanCalculatorClient() {
	const [firstParams, setFirstParams] = useState<ComputeParams>(DEFAULT_PARAMS)
	const [secondParams, setSecondParams] = useState<ComputeParams | null>(null)

	const isComparing = secondParams !== null

	const toggleComparison = () => {
		setSecondParams(isComparing ? null : { ...firstParams })
	}

	const firstResults = computeLoan(firstParams)
	const secondResults = secondParams ? computeLoan(secondParams) : null
	const diffValues = secondResults
		? diffResults(firstResults, secondResults)
		: null

	return (
		<div className="grid gap-12">
			<div
				className={`grid gap-8 ${isComparing ? "lg:grid-cols-2" : "max-w-sm"}`}
			>
				<Calculator params={firstParams} onChange={setFirstParams} />

				{isComparing && secondParams && (
					<Calculator params={secondParams} onChange={setSecondParams} />
				)}
			</div>

			<div
				className={`mx-auto flex w-full flex-col gap-12 ${diffValues ? "max-w-sm" : ""}`}
			>
				{diffValues && (
					<div className="border-border border-t pt-6">
						<h2 className="text-secondary mb-4 text-xs font-semibold tracking-widest uppercase">
							Difference (right vs left)
						</h2>
						<LoanCalculatorSummary values={diffValues} isComparison />
					</div>
				)}

				<button
					type="button"
					onClick={toggleComparison}
					className="text-accent hover:text-accent/80 w-fit text-sm font-medium transition-opacity duration-200"
				>
					{isComparing ? "Remove" : "Add"} comparison
				</button>
			</div>
		</div>
	)
}
