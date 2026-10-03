import { ProductGroupGallery } from "./ProductGallery"
import { PRODUCT_PROSE_CLASS, ProductSectionShell } from "./ProductSection"
import type { ReactNode } from "react"

// A step's gallery is as wide as the step's text (40em), so the two share a
// right edge: 640px at most, less the indent under the number on a phone.
const STEP_GALLERY_CLASS = "w-full max-w-[40em]"
const STEP_GALLERY_SIZES = "(max-width: 640px) calc(100vw - 5rem), 640px"

export interface ProductStep {
	id: number
	title: string
	/** The rendered markdown body. */
	body: ReactNode
	/** The step's gallery (`productGalleryGroups`); null when it has none. */
	galleryIndex: number | null
}

interface Props {
	id: string
	title: string
	/** The rendered intro above the steps; null when the section has none. */
	intro: ReactNode | null
	steps: readonly ProductStep[]
	/** Project name, for each step carousel's accessible name. */
	projectName: string
}

/**
 * A `steps` section: the title on its own line, then the numbered steps at the
 * column's full width, each with its gallery under its text. One `h3` per step
 * holds the number and the title, joined by a visually hidden ". " so it reads
 * "1. Log a meal" instead of "1Log a meal". `role="list"` because the list
 * style is off, which drops the list semantics in Safari.
 */
export default function ProductStepsSection({
	id,
	title,
	intro,
	steps,
	projectName,
}: Props) {
	return (
		<ProductSectionShell id={id} title={title}>
			{intro != null && <div className={PRODUCT_PROSE_CLASS}>{intro}</div>}

			<ol className="product-steps" role="list">
				{steps.map((step, index) => (
					<li key={step.id} className="product-step">
						<h3 className="product-step__title">
							<span className="product-step__num">
								{index + 1}
								<span className="sr-only">. </span>
							</span>
							<span>{step.title}</span>
						</h3>

						<div className="product-step__body">
							<div className={PRODUCT_PROSE_CLASS}>{step.body}</div>

							{step.galleryIndex != null && (
								<div className={`${STEP_GALLERY_CLASS} mt-5`}>
									<ProductGroupGallery
										groupIndex={step.galleryIndex}
										label={`${projectName}: ${step.title}`}
										sizes={STEP_GALLERY_SIZES}
									/>
								</div>
							)}
						</div>
					</li>
				))}
			</ol>
		</ProductSectionShell>
	)
}
