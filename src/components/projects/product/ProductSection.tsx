import { ProductSectionGallery } from "./ProductGallery"
import type { ReactNode } from "react"

interface Props {
	id: string
	title: string
	index: number
	/** Project name, for the carousel's accessible name. */
	projectName: string
	hasImages: boolean
	/** The rendered markdown body. */
	body: ReactNode
	/** Shown between the heading and the body: the plan cards. */
	beforeBody?: ReactNode
	/** Shown after the body: the store button that follows the plans. */
	afterBody?: ReactNode
}

/** The shared heading style for a product page `h2`. */
export const PRODUCT_H2_CLASS =
	"font-serif text-[30px] leading-[1.12] font-normal tracking-[-0.015em] text-balance sm:text-[36px]"

/**
 * One stacked section of an own-app page. A section with images (or the plan
 * cards, which need the width) stacks heading, pictures and text. A text-only
 * section puts its heading beside the text from 640px, so a run of them reads
 * as a change of pace rather than a row of gaps.
 */
export default function ProductSection({
	id,
	title,
	index,
	projectName,
	hasImages,
	body,
	beforeBody,
	afterBody,
}: Props) {
	const isSplit = !hasImages && beforeBody == null

	return (
		<section
			id={id}
			aria-labelledby={`${id}-title`}
			className="scroll-mt-4 border-t border-(--color-border) py-14 first:border-t-0 sm:py-[72px]"
		>
			<div
				className={
					isSplit
						? "grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,9fr)] sm:gap-10"
						: "grid gap-7"
				}
			>
				<h2 id={`${id}-title`} className={PRODUCT_H2_CLASS}>
					{title}
				</h2>

				{hasImages && (
					<ProductSectionGallery
						sectionIndex={index}
						label={`${projectName}: ${title}`}
					/>
				)}

				<div className="flex min-w-0 flex-col gap-7">
					{beforeBody}
					<div className="prose dark:prose-invert max-w-[40em]">{body}</div>
					{afterBody}
				</div>
			</div>
		</section>
	)
}
