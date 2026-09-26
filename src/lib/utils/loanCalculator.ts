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

/**
 * The longest duration the calculator accepts: 100 years. The amortization loop
 * in `computeLoan` runs once per month, so an unbounded duration freezes the tab.
 */
export const MAX_PERIOD_MONTHS = 1200

/**
 * The highest annual rate the calculator accepts. Past roughly 960%, the
 * compounding factor in `PMT` overflows to `Infinity` over a long duration and
 * every result turns into `NaN`; 100% is far above any real loan.
 */
export const MAX_ANNUAL_INTEREST_RATE = 100

/** The bounds one calculator input must satisfy before `computeLoan` sees it. */
export type LoanFieldRule = {
	min: number
	max?: number
	isWholeNumber?: boolean
}

/**
 * Per-input rules, mirroring `computeLoan`'s preconditions. The form validates
 * against these so an out-of-range value shows a message under its field
 * instead of reaching `computeLoan` and throwing during render.
 */
export const LOAN_FIELD_RULES = {
	loan: { min: 0 },
	period: { min: 1, max: MAX_PERIOD_MONTHS, isWholeNumber: true },
	annualInterestRate: { min: 0, max: MAX_ANNUAL_INTEREST_RATE },
	additionalCosts: { min: 0 },
	additionalMonthlyPayment: { min: 0 },
	extraPaymentValue: { min: 0 },
	extraPaymentFrequency: { min: 1, isWholeNumber: true },
	extraPaymentLimit: { min: 0, isWholeNumber: true },
} satisfies Record<string, LoanFieldRule>

export type LoanFieldResult =
	{ value: number; error: null } | { value: null; error: string }

/**
 * Parses one input's raw text against its rule. Returns either the number or
 * the message to show under the field — never both.
 *
 * `Number`, not `parseFloat`: `parseFloat("12abc")` is `12`, which would accept
 * text the field doesn't show as a number. An empty field is its own error, not
 * `0`, so clearing a field to retype it doesn't briefly compute with zero.
 */
export function parseLoanField(
	raw: string,
	rule: LoanFieldRule
): LoanFieldResult {
	const trimmed = raw.trim()

	if (trimmed === "") {
		return { value: null, error: "Enter a number." }
	}

	const value = Number(trimmed)

	if (!Number.isFinite(value)) {
		return { value: null, error: "Enter a number." }
	}

	if (rule.isWholeNumber && !Number.isInteger(value)) {
		return { value: null, error: "Use a whole number." }
	}

	if (value < rule.min) {
		return { value: null, error: `Use ${rule.min} or more.` }
	}

	if (rule.max != null && value > rule.max) {
		return { value: null, error: `Use ${rule.max} or less.` }
	}

	return { value, error: null }
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

	if (period > MAX_PERIOD_MONTHS) {
		throw new Error(`period must be <= ${MAX_PERIOD_MONTHS}, got ${period}`)
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
