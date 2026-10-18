import { ProjectSectionLayout } from "@/generated/prisma/enums"
import { sectionHeadingId } from "@/lib/utils/productPage"
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

// The content column the sections sit in, by viewport width `w`: the frame
// (`.product-frame`, 1200px at most) less its gutters, 16px a side below 640px,
// 32px to 1023px and 48px from 1024px; from 1080px, less the 200px section
// rail and its 64px gap too. So `w - 32px`, `w - 64px`, `w - 96px`, then
// `w - 360px`, up to 840px from 1200px. The `sizes` below follow it, so each
// viewport fetches the width it shows: a flat "840px" fetched too much at
// 640–904px and 1080–1200px, and too little at 904–1080px, where the column is
// up to 983px wide.

// A stacked section's gallery spans the content column.
const WIDE_GALLERY_SIZES = [
	"(max-width: 639px) calc(100vw - 2rem)",
	"(max-width: 1023px) calc(100vw - 4rem)",
	"(max-width: 1079px) calc(100vw - 6rem)",
	"(max-width: 1199px) calc(100vw - 360px)",
	"840px",
].join(", ")

// A split section's gallery sits under its text in the right column: 32rem at
// most. From 640px that column is 9/14 of the content column less the 40px
// gap, which is under 512px up to 900px and again from 1080px to 1200px, where
// the rail takes its share. Below 640px the section is one column.
const NARROW_GALLERY_CLASS = "w-full max-w-[32rem]"
const NARROW_GALLERY_SIZES = [
	"(max-width: 543px) calc(100vw - 2rem)",
	"(max-width: 639px) 512px",
	"(max-width: 899px) calc((100vw - 104px) * 9 / 14)",
	"(max-width: 1079px) 512px",
	"(max-width: 1199px) calc((100vw - 400px) * 9 / 14)",
	"512px",
].join(", ")

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
	const headingId = sectionHeadingId(id)

	return (
		<section
			id={id}
			aria-labelledby={headingId}
			className="scroll-mt-4 py-14 sm:py-[72px]"
		>
			<div
				className={
					isSplit
						? "grid gap-4 sm:grid-cols-[minmax(0,5fr)_minmax(0,9fr)] sm:gap-10"
						: "grid gap-7"
				}
			>
				<h2 id={headingId} className={PRODUCT_H2_CLASS}>
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
