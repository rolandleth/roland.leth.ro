"use client"

import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { fadeUp } from "@/lib/client/motion"
import FaqItem from "./FaqItem"
import type { ReactNode } from "react"

interface FaqEntry {
	id: number
	question: string
}

interface Props {
	faqs: FaqEntry[]
	/**
	 * Pre-rendered Markdown answers, aligned by index with `faqs`. Rendered on
	 * the server (like section descriptions) so the client component stays free
	 * of the Markdown pipeline.
	 */
	renderedAnswers: ReactNode[]
	accent: string
}

export default function ProjectFaq({ faqs, renderedAnswers, accent }: Props) {
	return (
		<motion.section
			className="mt-12"
			aria-labelledby="faq-heading"
			{...fadeUp(0.25)}
		>
			<h2
				id="faq-heading"
				className="mb-4 text-xl font-semibold"
				style={{ color: accent }}
			>
				FAQ
			</h2>

			<div className="border-border border-t">
				{faqs.map((faq, index) => (
					<FaqItem
						key={faq.id}
						id={faq.id}
						className="border-border border-b"
						buttonClassName="text-primary flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left text-base font-medium transition-colors duration-300 hover:opacity-80"
						answerClassName="prose dark:prose-invert max-w-none pb-4"
						question={
							<>
								{faq.question}

								<span
									aria-hidden
									className="shrink-0 transition-transform duration-200 group-data-open/faq:rotate-180 motion-reduce:transition-none"
									style={{ color: accent }}
								>
									<ChevronDown size={18} />
								</span>
							</>
						}
					>
						{renderedAnswers[index]}
					</FaqItem>
				))}
			</div>
		</motion.section>
	)
}
