import { PRODUCT_H2_CLASS } from "./ProductSection"
import type { ReactNode } from "react"

interface Props {
	faqs: readonly { id: number; question: string }[]
	/** Rendered markdown answers, aligned by index with `faqs`. */
	renderedAnswers: readonly ReactNode[]
}

/**
 * The FAQ on an own-app page: native `<details>`, so every answer is in the
 * HTML whether open or not, and toggling needs no JavaScript. Lines between
 * questions only, none above the first or below the last.
 */
export default function ProductFaq({ faqs, renderedAnswers }: Props) {
	return (
		<section
			id="faq"
			aria-labelledby="faq-title"
			className="scroll-mt-4 border-t border-(--color-border) py-14 sm:py-[72px]"
		>
			<div className="grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,9fr)] sm:gap-10">
				<h2 id="faq-title" className={PRODUCT_H2_CLASS}>
					FAQ
				</h2>

				<div className="min-w-0 sm:-mt-[18px]">
					{faqs.map((faq, index) => (
						<details
							key={faq.id}
							className="group border-t border-(--color-border) first:border-t-0"
						>
							<summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-[18px] [&::-webkit-details-marker]:hidden">
								<h3 className="text-primary m-0 font-sans text-[17px] leading-snug font-medium">
									{faq.question}
								</h3>
								<span
									aria-hidden
									className="flex h-6 w-6 shrink-0 items-center justify-center text-[22px] leading-none font-light text-(--product-accent-text)"
								>
									<span className="group-open:hidden">+</span>
									<span className="hidden group-open:inline">−</span>
								</span>
							</summary>

							<div className="prose dark:prose-invert text-secondary max-w-none pr-10 pb-5">
								{renderedAnswers[index]}
							</div>
						</details>
					))}
				</div>
			</div>
		</section>
	)
}
