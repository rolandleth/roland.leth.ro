import FaqItem from "../FaqItem"
import { PRODUCT_H2_CLASS, TRIM_RENDERED_MARKDOWN } from "./ProductSection"
import type { ReactNode } from "react"

interface Props {
	faqs: readonly { id: number; question: string }[]
	/** Rendered markdown answers, aligned by index with `faqs`. */
	renderedAnswers: readonly ReactNode[]
}

/**
 * The FAQ on an own-app page: the same questions and animated answers as the
 * tabbed layout's (`FaqItem`), in the product page's look. Lines between
 * questions only, none above the first or below the last. The plus turns into
 * a minus while open, at once for readers who ask for less motion.
 *
 * The question is serif, like every heading on the site and like the design:
 * the button inherits the `h3`'s font.
 */
export default function ProductFaq({ faqs, renderedAnswers }: Props) {
	return (
		<section
			id="faq"
			aria-labelledby="faq-title"
			className="scroll-mt-4 py-14 sm:py-[72px]"
		>
			<div className="grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,9fr)] sm:gap-10">
				<h2 id="faq-title" className={PRODUCT_H2_CLASS}>
					FAQ
				</h2>

				<div className="min-w-0 sm:-mt-[18px]">
					{faqs.map((faq, index) => (
						<FaqItem
							key={faq.id}
							id={faq.id}
							className="border-t border-(--color-border) first:border-t-0"
							headingClassName="m-0"
							buttonClassName="text-primary flex w-full cursor-pointer items-start justify-between gap-4 py-[18px] text-left text-[17px] leading-snug font-medium"
							answerClassName={`prose dark:prose-invert text-secondary max-w-none pr-10 pb-5 ${TRIM_RENDERED_MARKDOWN}`}
							question={
								<>
									<span>{faq.question}</span>
									{/* A plus whose upright bar turns flat: a minus while open. */}
									<span
										aria-hidden
										className="relative h-6 w-6 shrink-0 text-(--product-accent-text)"
									>
										<span className="absolute top-1/2 left-1/2 h-[1.5px] w-3.5 -translate-1/2 bg-current" />
										<span className="absolute top-1/2 left-1/2 h-3.5 w-[1.5px] -translate-1/2 bg-current transition-transform duration-250 ease-out group-data-open/faq:rotate-90 motion-reduce:transition-none" />
									</span>
								</>
							}
						>
							{renderedAnswers[index]}
						</FaqItem>
					))}
				</div>
			</div>
		</section>
	)
}
