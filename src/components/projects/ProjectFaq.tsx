"use client"

import { motion } from "framer-motion"
import { ChevronDown } from "lucide-react"
import { useState } from "react"
import { fadeUp } from "@/lib/client/motion"
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
	// Multiple panels can be open at once — each question toggles independently,
	// the conventional FAQ behaviour. Tracked by id so reorders/removals can't
	// strand an index.
	const [openIds, setOpenIds] = useState<ReadonlySet<number>>(new Set())

	function toggle(id: number) {
		setOpenIds((prev) => {
			const next = new Set(prev)

			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}

			return next
		})
	}

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
				{faqs.map((faq, index) => {
					const isOpen = openIds.has(faq.id)

					return (
						<div key={faq.id} className="border-border border-b">
							<h3>
								<button
									type="button"
									onClick={() => toggle(faq.id)}
									aria-expanded={isOpen}
									aria-controls={`faq-panel-${faq.id}`}
									id={`faq-button-${faq.id}`}
									className="text-primary flex w-full cursor-pointer items-center justify-between gap-4 py-4 text-left text-base font-medium transition-colors duration-300 hover:opacity-80"
								>
									{faq.question}

									<motion.span
										aria-hidden
										className="shrink-0"
										animate={{ rotate: isOpen ? 180 : 0 }}
										transition={{ duration: 0.2 }}
										style={{ color: accent }}
									>
										<ChevronDown size={18} />
									</motion.span>
								</button>
							</h3>

							{/* The panel is ALWAYS mounted so its answer ships in the
							    server HTML — search engines and AI answer engines read
							    the static markup, and conditional-mounting (AnimatePresence)
							    would hide collapsed answers from them. Collapse is purely
							    visual (height/opacity); `inert` + `aria-hidden` pull a
							    collapsed panel out of the tab order and accessibility tree
							    so assistive tech skips it, the way a native <details> does.
							    The FAQPage JSON-LD carries the same answers for structured
							    consumers. */}
							<motion.div
								id={`faq-panel-${faq.id}`}
								role="region"
								aria-labelledby={`faq-button-${faq.id}`}
								aria-hidden={!isOpen}
								inert={!isOpen}
								initial={false}
								animate={{
									height: isOpen ? "auto" : 0,
									opacity: isOpen ? 1 : 0,
								}}
								transition={{ duration: 0.25, ease: "easeOut" }}
								className="overflow-hidden"
							>
								<div className="prose dark:prose-invert max-w-none pb-4">
									{renderedAnswers[index]}
								</div>
							</motion.div>
						</div>
					)
				})}
			</div>
		</motion.section>
	)
}
