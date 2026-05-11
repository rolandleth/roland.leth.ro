import LoanCalculatorClient from "@/components/loan-calculator/LoanCalculatorClient"
import PageGlow from "@/components/PageGlow"
import { buildPageMetadata } from "@/lib/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Loan Calculator",
	description:
		"Calculate loan payment schedules and compare different scenarios.",
	path: "/tools/loan-calculator",
})

export default function LoanCalculatorPage() {
	return (
		<main className="relative mx-auto max-w-5xl px-4 py-12">
			<PageGlow />

			<div className="mb-8">
				<h1 className="text-primary text-3xl font-bold">Loan Calculator</h1>
				<p className="text-secondary mt-2 text-sm">
					Calculate payment schedules and compare different scenarios.
				</p>
			</div>

			<LoanCalculatorClient />
		</main>
	)
}
