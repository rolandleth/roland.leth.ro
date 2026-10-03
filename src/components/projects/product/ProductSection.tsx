import { ProjectSectionLayout } from "@/generated/prisma/enums"
import { ProductGroupGallery } from "./ProductGallery"
import type { ReactNode } from "react"

/** The shared heading style for a product page `h2`. */
export const PRODUCT_H2_CLASS =
	"font-serif text-[30px] leading-[1.12] font-normal tracking-[-0.015em] text-balance sm:text-[36px]"

/**
 * Drops the outer margins of rendered markdown. Each body arrives wrapped in a
 * `<div>` (it carries the React key), so typography's own "no margin on the
 * first and last child" rule lands on the wrapper, and the first paragraph kept
 * its top margin: text sat lower than the title beside it, and further from
 * the image above it, than the layout means.
 */
export const TRIM_RENDERED_MARKDOWN =
	"[&>div>:first-child]:mt-0 [&>div>:last-child]:mb-0"

/**
 * Markdown text in a section or a step: the reading measure. `text-pretty`
 * keeps a lone word off a paragraph's last line, as in the hero summary;
 * browsers without it wrap as before.
 */
export const PRODUCT_PROSE_CLASS = `prose dark:prose-invert max-w-[40em] text-pretty ${TRIM_RENDERED_MARKDOWN}`

// A split section's gallery sits under its text in the right column: 32rem at
// most, which is that column's width on a full-width page.
const NARROW_GALLERY_CLASS = "w-full max-w-[32rem]"
const NARROW_GALLERY_SIZES = "(max-width: 640px) calc(100vw - 2rem), 512px"

// A stacked section's gallery spans the content column: 840px at most; below
// 640px the page has 16px gutters.
const WIDE_GALLERY_SIZES = "(max-width: 640px) calc(100vw - 2rem), 840px"

interface ShellProps {
	id: string
	title: string
	/** Title in a narrow left column from 640px, the content beside it. */
	isSplit?: boolean
	children: ReactNode
}

/**
 * The frame every product page section shares: its anchor, the `h2`, and a
 * column for the content. Stacked by default; split puts the title beside the
 * content from 640px, so a run of short sections reads as a change of pace
 * rather than a row of gaps. Sections are set apart by space alone: a rule
 * above each one doubled up with the first step's, right under a title.
 */
export function ProductSectionShell({
	id,
	title,
	isSplit = false,
	children,
}: ShellProps) {
	return (
		<section
			id={id}
			aria-labelledby={`${id}-title`}
			className="scroll-mt-4 py-14 sm:py-[72px]"
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

				<div className="flex min-w-0 flex-col gap-7">{children}</div>
			</div>
		</section>
	)
}

interface TextSectionProps {
	id: string
	title: string
	layout: ProjectSectionLayout
	/** The section's gallery (`productGalleryGroups`); null when it has none. */
	galleryIndex: number | null
	/** The carousel's accessible name, before "screenshots". */
	galleryLabel: string
	/** The rendered markdown body. */
	body: ReactNode
}

/**
 * A `text` section. Stacked: title, gallery, text. Split: title on the left;
 * text on the right with its gallery under it, at the column's width.
 */
export function ProductTextSection({
	id,
	title,
	layout,
	galleryIndex,
	galleryLabel,
	body,
}: TextSectionProps) {
	const isSplit = layout === ProjectSectionLayout.split
	const prose = <div className={PRODUCT_PROSE_CLASS}>{body}</div>

	if (galleryIndex == null) {
		return (
			<ProductSectionShell id={id} title={title} isSplit={isSplit}>
				{prose}
			</ProductSectionShell>
		)
	}

	const gallery = (
		<ProductGroupGallery
			groupIndex={galleryIndex}
			label={galleryLabel}
			sizes={isSplit ? NARROW_GALLERY_SIZES : WIDE_GALLERY_SIZES}
		/>
	)

	return (
		<ProductSectionShell id={id} title={title} isSplit={isSplit}>
			{isSplit ? (
				<>
					{prose}
					<div className={NARROW_GALLERY_CLASS}>{gallery}</div>
				</>
			) : (
				<>
					{gallery}
					{prose}
				</>
			)}
		</ProductSectionShell>
	)
}
