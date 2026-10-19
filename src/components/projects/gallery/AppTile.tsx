import Image from "next/image"
import { linkCtasFor } from "@/lib/utils/platforms"
import { statusLabel } from "@/lib/utils/projectStatus"
import StoreLinks from "../StoreLinks"
import { TEXT_BESIDE_IMAGE_COLUMNS_CLASS } from "./galleryLayout"
import ProjectIcon from "./ProjectIcon"
import ViewProjectLink from "./ViewProjectLink"
import type { ProjectGalleryItem } from "@/lib/db/projects"

interface Props {
	project: ProjectGalleryItem
	/** Spans the row: the title, summary and buttons beside the full image. */
	isWide: boolean
	/** The first tile's image is the gallery's likely largest paint. */
	isImagePriority: boolean
}

// The image's share of a tile, for `sizes`: about 560px of a wide tile's
// 1104px row, 460px of a half tile; the whole column below 900px.
const WIDE_IMAGE_SIZES = "(min-width: 900px) 560px, calc(100vw - 2rem)"
const HALF_IMAGE_SIZES = "(min-width: 900px) 460px, calc(100vw - 2rem)"

/**
 * One high-prominence project on the gallery, on its product page's band
 * colours (`AppTileStyle`; the site's defaults without a palette). Both kinds
 * have the same text: the name and the eyebrow, the summary, the store buttons
 * and "View project". A wide tile has the full hero image beside it; a half
 * tile has the top of the hero image rising from its bottom edge. Without a
 * hero image, the text takes the whole tile.
 *
 * A coming-soon app's store link is a bare pill (`linkCtasFor`), which a tile
 * leaves out: its status takes the buttons' place, beside "View project", as
 * on its product page. A discontinued app never gets a tile:
 * `gallerySectionOf` sends it to More projects whatever its prominence.
 *
 * No price: a store note can't speak for several (a monthly, a yearly and a
 * lifetime one), and the product page has the plans. Not one big link, since
 * the store buttons go to the App Store and links can't nest; so no lift on
 * hover either.
 */
export default function AppTile({ project, isWide, isImagePriority }: Props) {
	const storeLinks = linkCtasFor(project).filter(
		({ cta }) => cta.kind !== "plainPill"
	)
	const image = project.productHeroImage
	const imageAlt = project.heroImageAlt ?? `${project.name} screenshot`

	const actions = (
		<StoreLinks
			storeLinks={storeLinks}
			statusLabel={statusLabel(project.status)}
			accent="var(--product-band-hi)"
			isLarge={false}
			className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3"
			trailingLink={
				<ViewProjectLink
					slug={project.slug}
					name={project.name}
					decorationClassName="decoration-(--product-band-hi)"
				/>
			}
		/>
	)

	// From 900px both kinds pad 44px at the sides (`p-11`, `px-11`), so a wide
	// tile's text starts on the same line as the half tiles' under it.
	if (isWide) {
		return (
			<article
				data-app-tile={project.slug}
				className={`app-tile product-band grid gap-8 overflow-hidden rounded-3xl bg-(--product-band) px-7 py-9 text-(--product-band-ink) min-[900px]:items-center min-[900px]:gap-12 min-[900px]:p-11 ${
					image == null ? "" : TEXT_BESIDE_IMAGE_COLUMNS_CLASS
				}`}
			>
				<div className="min-w-0">
					<TileTitle project={project} />

					<p className="mt-5 text-[17px] leading-[1.55] text-pretty text-(--product-band-ink2)">
						{project.summary}
					</p>

					{actions}
				</div>

				{image != null && (
					<figure className="m-0 min-w-0">
						<div className="product-shot relative aspect-[1270/760] overflow-hidden rounded-[14px]">
							<Image
								src={image}
								alt={imageAlt}
								fill
								priority={isImagePriority}
								sizes={WIDE_IMAGE_SIZES}
								className="object-cover"
							/>
						</div>
					</figure>
				)}
			</article>
		)
	}

	// The image closes a half tile at its bottom edge; without one, the tile
	// pads its bottom as it pads its top.
	return (
		<article
			data-app-tile={project.slug}
			className={`app-tile product-band flex h-full flex-col overflow-hidden rounded-3xl bg-(--product-band) px-7 pt-9 text-(--product-band-ink) min-[900px]:px-11 min-[900px]:pt-11 ${
				image == null ? "pb-9 min-[900px]:pb-11" : ""
			}`}
		>
			<TileTitle project={project} />

			<p className="mt-5 text-base leading-[1.6] text-pretty text-(--product-band-ink2)">
				{project.summary}
			</p>

			{actions}

			{/* The top of the hero image, cut off by the tile's bottom edge: the
			    crop shows 630 of its 760 rows. `mt-auto` pins it to the bottom, so
			    two halves in a row end level whatever their text's length. */}
			{image != null && (
				<div className="mt-auto pt-10">
					<div className="aspect-[1270/630] overflow-hidden">
						<div className="product-shot relative aspect-[1270/760] overflow-hidden rounded-xl">
							<Image
								src={image}
								alt={imageAlt}
								fill
								priority={isImagePriority}
								sizes={HALF_IMAGE_SIZES}
								className="object-cover"
							/>
						</div>
					</div>
				</div>
			)}
		</article>
	)
}

/**
 * A tile's heading, the same on both kinds, so the titles match across the
 * rows: the name and the eyebrow, joined for screen readers by a visually
 * hidden ": ", as the product page's `h1` is, so it reads "Digest: Food
 * journal for iPhone and iPad" rather than two phrases run together. An `h2`:
 * the apps sit straight under the page's `h1`, with no section heading between.
 */
function TileTitle({ project }: { project: ProjectGalleryItem }) {
	const { name, icon, heroEyebrow } = project

	return (
		<h2 className="flex flex-col gap-3.5 font-normal">
			<span className="flex items-center gap-4 font-serif text-[38px] leading-none font-normal tracking-[-0.02em] min-[900px]:text-[44px]">
				<ProjectIcon name={name} icon={icon} size={48} className="shadow-sm" />
				{name}
			</span>

			{heroEyebrow != null && (
				<>
					<span className="sr-only">: </span>
					<span className="font-serif text-xl leading-snug text-(--product-band-hi) italic">
						{heroEyebrow}
					</span>
				</>
			)}
		</h2>
	)
}
