// type: when the payments are due:
//   0: end of the period, e.g. end of month (default)
//   1: beginning of period
type PMTParams = {
	monthlyInterestRate: number
	period: number
	loan: number
	residualValue?: number
	type?: number
}

type ExtraPayments = {
	limit: number
	value: number
	// 1 = every month, 2 = every 2 months, etc.
	frequency: number
}

export type ComputeParams = {
	period: number
	loan: number
	additionalCosts: number
	annualInterestRate: number
	additionalMonthlyPayment: number
	extraPayments: ExtraPayments
}

export type ComputeReturn = {
	baseMonthlyPayment: number
	actualMonthlyPayment: number
	actualMonthlyPaymentWithExtra: number
	total: number
	totalInterest: number
	percentageOfOverpay: number
	durationOfRepay: number
	numberOfPaidExtraPayments: number
	valueOfPaidExtraPayments: number
	repayDurationDifference: number
}

export function formatNumber(value: number, digits: number = 2): string {
	return value.toLocaleString(undefined, {
		maximumFractionDigits: digits,
		minimumFractionDigits: digits,
	})
}

function PMT({
	monthlyInterestRate: interestRate,
	period,
	loan,
	residualValue = 0,
	type = 0,
}: PMTParams): number {
	if (interestRate === 0) {
		return (loan + residualValue) / period
	}

	const loanIf = Math.pow(1 + interestRate, period)
	let pmt = (interestRate * loan * (loanIf + residualValue)) / (loanIf - 1)

	if (type === 1) {
		pmt /= 1 + interestRate
	}

	return pmt
}

export default function computeLoan({
	period,
	loan,
	additionalCosts,
	annualInterestRate,
	additionalMonthlyPayment,
	extraPayments,
}: ComputeParams): ComputeReturn {
	const monthlyInterestRate = (annualInterestRate * 0.01) / 12
	const baseMonthlyPayment = PMT({ monthlyInterestRate, period, loan })
	const actualMonthlyPayment = baseMonthlyPayment + additionalMonthlyPayment

	let remainingLoan = loan
	let total = loan + additionalCosts
	let totalInterest = 0
	let numberOfPaidExtraPayments = 0
	let valueOfPaidExtraPayments = 0
	let durationOfRepay = 0

	// Treat frequency of 0 as 1 (monthly) to avoid modulo-by-zero.
	const safeFrequency = Math.max(1, extraPayments.frequency)

	while (durationOfRepay < period && remainingLoan > 0) {
		const monthlyInterest = remainingLoan * monthlyInterestRate
		let principal = actualMonthlyPayment - monthlyInterest

		const hasExtraPayments = extraPayments.value > 0
		const hasExtraPaymentsRemaining =
			extraPayments.limit < 1 || numberOfPaidExtraPayments < extraPayments.limit
		const isExtraPaymentMonth = durationOfRepay % safeFrequency === 0

		if (hasExtraPayments && hasExtraPaymentsRemaining && isExtraPaymentMonth) {
			numberOfPaidExtraPayments += 1
			valueOfPaidExtraPayments += extraPayments.value
			principal += extraPayments.value
		}

		remainingLoan -= principal
		totalInterest += monthlyInterest
		durationOfRepay += 1
	}

	total += totalInterest

	// If there are no extra payments, ignore any value passed in.
	const actualMonthlyPaymentWithExtra =
		extraPayments.value > 0
			? actualMonthlyPayment + extraPayments.value
			: actualMonthlyPayment
	const percentageOfOverpay = (totalInterest / Math.max(0.01, loan)) * 100
	const repayDurationDifference = period - durationOfRepay

	return {
		baseMonthlyPayment,
		actualMonthlyPayment,
		actualMonthlyPaymentWithExtra,
		total,
		totalInterest,
		percentageOfOverpay,
		durationOfRepay,
		numberOfPaidExtraPayments,
		valueOfPaidExtraPayments,
		repayDurationDifference,
	}
}
