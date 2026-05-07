import { describe, expect, it } from "vitest"
import computeLoan, { formatNumber } from "@/lib/loanCalculator"

const baseParams = {
	period: 360,
	loan: 100_000,
	additionalCosts: 0,
	annualInterestRate: 5,
	additionalMonthlyPayment: 0,
	extraPayments: { limit: 0, value: 0, frequency: 1 },
}

// #region formatNumber

describe("formatNumber", () => {
	// Pinned to en-US so SSR and client never disagree on hydration.
	it("formats with 2 decimal digits by default", () => {
		expect(formatNumber(1234.5)).toBe("1,234.50")
	})

	it("pads short fractions to the requested precision", () => {
		expect(formatNumber(7, 3)).toBe("7.000")
	})

	it("truncates to the requested maximum digits", () => {
		expect(formatNumber(1.2345, 2)).toBe("1.23")
	})

	it("handles zero", () => {
		expect(formatNumber(0)).toBe("0.00")
	})
})

// #endregion

// #region Zero-loan short-circuit

describe("computeLoan — zero loan short-circuit", () => {
	it("returns all zeros plus additionalCosts as total when loan is 0", () => {
		const result = computeLoan({ ...baseParams, loan: 0, additionalCosts: 250 })
		expect(result).toEqual({
			baseMonthlyPayment: 0,
			actualMonthlyPayment: 0,
			actualMonthlyPaymentWithExtra: 0,
			total: 250,
			totalInterest: 0,
			percentageOfOverpay: 0,
			durationOfRepay: 0,
			numberOfPaidExtraPayments: 0,
			valueOfPaidExtraPayments: 0,
			repayDurationDifference: baseParams.period,
		})
	})

	it("also short-circuits on negative loan input", () => {
		// `loan <= 0` guard prevents a divide-by-zero in PMT on negative inputs,
		// and keeps downstream percentage math defined.
		const result = computeLoan({ ...baseParams, loan: -50 })
		expect(result.baseMonthlyPayment).toBe(0)
		expect(result.durationOfRepay).toBe(0)
	})
})

// #endregion

// #region Throwing input

describe("computeLoan — input validation", () => {
	it("throws when extraPayments.frequency < 1", () => {
		expect(() =>
			computeLoan({
				...baseParams,
				extraPayments: { limit: 0, value: 100, frequency: 0 },
			})
		).toThrow(/frequency/)
	})

	it("throws when extraPayments.frequency is negative", () => {
		expect(() =>
			computeLoan({
				...baseParams,
				extraPayments: { limit: 0, value: 100, frequency: -1 },
			})
		).toThrow(/frequency/)
	})

	it("throws on negative annualInterestRate (would produce a negative totalInterest)", () => {
		expect(() =>
			computeLoan({ ...baseParams, annualInterestRate: -1 })
		).toThrow(/annualInterestRate/)
	})

	it("throws on zero period", () => {
		expect(() => computeLoan({ ...baseParams, period: 0 })).toThrow(/period/)
	})

	it("throws on negative period", () => {
		expect(() => computeLoan({ ...baseParams, period: -10 })).toThrow(/period/)
	})
})

// #endregion

// #region Reference PMT values

describe("computeLoan — reference PMT values", () => {
	it("computes ~$536.82 monthly for $100k @ 5% over 360 months", () => {
		// Standard mortgage reference: $100,000 principal, 5% annual rate, 30 years.
		const result = computeLoan(baseParams)
		expect(result.baseMonthlyPayment).toBeCloseTo(536.82, 2)
	})

	it("computes a principal-only monthly payment at 0% interest", () => {
		// At 0% rate, PMT degenerates to loan / period.
		const result = computeLoan({
			...baseParams,
			annualInterestRate: 0,
		})
		expect(result.baseMonthlyPayment).toBeCloseTo(100_000 / 360, 2)
		expect(result.totalInterest).toBe(0)
	})

	it("adds the extra monthly payment to actualMonthlyPayment", () => {
		const result = computeLoan({
			...baseParams,
			additionalMonthlyPayment: 100,
		})
		expect(result.actualMonthlyPayment).toBeCloseTo(
			result.baseMonthlyPayment + 100,
			2
		)
	})

	it("includes the principal, interest, and additionalCosts in total", () => {
		const result = computeLoan({
			...baseParams,
			additionalCosts: 500,
		})
		expect(result.total).toBeCloseTo(100_000 + 500 + result.totalInterest, 2)
	})

	it("derives percentageOfOverpay from totalInterest / loan", () => {
		const result = computeLoan(baseParams)
		expect(result.percentageOfOverpay).toBeCloseTo(
			(result.totalInterest / 100_000) * 100,
			4
		)
	})
})

// #endregion

// #region Repay duration and extra payments

describe("computeLoan — accelerated repay via extras", () => {
	it("repays in exactly `period` months with no extra payments at a fair rate", () => {
		// Baseline: no extras, interest rate set so PMT exactly amortizes over
		// the full term; durationOfRepay should land on `period`.
		const result = computeLoan(baseParams)
		expect(result.durationOfRepay).toBe(baseParams.period)
		expect(result.repayDurationDifference).toBe(0)
	})

	it("shortens the repay duration when an additional monthly payment is set", () => {
		const base = computeLoan(baseParams)
		const withExtra = computeLoan({
			...baseParams,
			additionalMonthlyPayment: 200,
		})
		expect(withExtra.durationOfRepay).toBeLessThan(base.durationOfRepay)
		expect(withExtra.repayDurationDifference).toBeGreaterThan(0)
	})

	it("applies an extraPayment on every frequency-th month", () => {
		// frequency=3 over 360 months → up to 120 applications, capped by the
		// principal being repaid. Limit=0 means unlimited.
		const result = computeLoan({
			...baseParams,
			extraPayments: { limit: 0, value: 500, frequency: 3 },
		})
		expect(result.numberOfPaidExtraPayments).toBeGreaterThan(0)
		expect(result.valueOfPaidExtraPayments).toBe(
			result.numberOfPaidExtraPayments * 500
		)
		// Paying extra always shortens repay vs. no-extras baseline.
		expect(result.durationOfRepay).toBeLessThan(baseParams.period)
	})

	it("respects extraPayments.limit as a hard cap on count", () => {
		const result = computeLoan({
			...baseParams,
			extraPayments: { limit: 5, value: 500, frequency: 1 },
		})
		expect(result.numberOfPaidExtraPayments).toBeLessThanOrEqual(5)
	})

	it("actualMonthlyPaymentWithExtra reflects extras when value > 0", () => {
		const result = computeLoan({
			...baseParams,
			extraPayments: { limit: 0, value: 200, frequency: 1 },
		})
		expect(result.actualMonthlyPaymentWithExtra).toBeCloseTo(
			result.actualMonthlyPayment + 200,
			2
		)
	})

	it("actualMonthlyPaymentWithExtra equals actualMonthlyPayment when extras are zero", () => {
		const result = computeLoan(baseParams)
		expect(result.actualMonthlyPaymentWithExtra).toBe(
			result.actualMonthlyPayment
		)
	})
})

// #endregion
