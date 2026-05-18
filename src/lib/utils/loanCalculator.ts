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

// Pinned locale so server-rendered numbers don't disagree with the client's
// runtime locale on hydration (different thousands separators trip React).
export function formatNumber(value: number, digits: number = 2): string {
	return value.toLocaleString("en-US", {
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
	// Zero-loan short-circuit keeps downstream math (PMT, % overpay) well-defined and avoids a divide-by-zero masked by Math.max.
	if (loan <= 0) {
		return {
			baseMonthlyPayment: 0,
			actualMonthlyPayment: 0,
			actualMonthlyPaymentWithExtra: 0,
			total: additionalCosts,
			totalInterest: 0,
			percentageOfOverpay: 0,
			durationOfRepay: 0,
			numberOfPaidExtraPayments: 0,
			valueOfPaidExtraPayments: 0,
			repayDurationDifference: period,
		}
	}

	if (extraPayments.frequency < 1) {
		throw new Error(
			`extraPayments.frequency must be >= 1, got ${extraPayments.frequency}`
		)
	}

	if (annualInterestRate < 0) {
		throw new Error(
			`annualInterestRate must be >= 0, got ${annualInterestRate}`
		)
	}

	if (period < 1) {
		throw new Error(`period must be >= 1, got ${period}`)
	}

	const monthlyInterestRate = (annualInterestRate * 0.01) / 12
	const baseMonthlyPayment = PMT({ monthlyInterestRate, period, loan })
	const actualMonthlyPayment = baseMonthlyPayment + additionalMonthlyPayment

	let remainingLoan = loan
	let total = loan + additionalCosts
	let totalInterest = 0
	let numberOfPaidExtraPayments = 0
	let valueOfPaidExtraPayments = 0
	let durationOfRepay = 0

	while (durationOfRepay < period && remainingLoan > 0) {
		const monthlyInterest = remainingLoan * monthlyInterestRate
		let principal = actualMonthlyPayment - monthlyInterest

		const hasExtraPayments = extraPayments.value > 0
		const hasExtraPaymentsRemaining =
			extraPayments.limit < 1 || numberOfPaidExtraPayments < extraPayments.limit
		const isExtraPaymentMonth = durationOfRepay % extraPayments.frequency === 0

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

	const actualMonthlyPaymentWithExtra =
		extraPayments.value > 0
			? actualMonthlyPayment + extraPayments.value
			: actualMonthlyPayment
	const percentageOfOverpay = (totalInterest / loan) * 100
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
