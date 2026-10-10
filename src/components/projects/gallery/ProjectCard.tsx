import Image from "next/image"
import { compactLabel } from "@/lib/utils/platforms"
import { statusLabel } from "@/lib/utils/projectStatus"
import { TEXT_BESIDE_IMAGE_COLUMNS_CLASS } from "./galleryLayout"
import ProjectIcon from "./ProjectIcon"
import ViewProjectLink from "./ViewProjectLink"
import type { ProjectGalleryItem } from "@/lib/db/projects"
import type { CSSProperties } from "react"

interface Props {
	project: ProjectGalleryItem
}

// The image's share of the card from 900px, about 580px of the 1104px row.
const IMAGE_SIZES = "(min-width: 900px) 580px, calc(100vw - 2rem)"

/**
 * A medium-prominence project on a plain raised card: the name, "role ·
 * platform" with a coming-soon project's status pill beside it, the summary
 * and "View project" on the left, and the top-left of its card image set into
 * the card's bottom-right corner. Without a card image, the text takes the
 * whole card.
 */
export default function ProjectCard({ project }: Props) {
	const { name, slug, icon, role, summary, featuredImage, accentColor } =
		project
	const platform = compactLabel(project.bucket, project.platformTags)
	const roleLine = role == null ? platform : `${role} · ${platform}`
	const label = statusLabel(project.status)
	// The underline takes the project's accent; the site's without one.
	const accentStyle = {
		"--project-accent": accentColor ?? "var(--color-accent-value)",
	} as CSSProperties

	return (
		<article
			style={accentStyle}
			className={`grid overflow-hidden rounded-3xl border border-(--color-border) bg-(--color-surface) ${
				featuredImage == null ? "" : TEXT_BESIDE_IMAGE_COLUMNS_CLASS
			}`}
		>
			<div className="flex flex-col justify-center px-7 py-8 min-[900px]:p-11">
				{/* An `h2`: the cards sit under the page's `h1` with no section
				    heading between, as the tiles do. */}
				<h2 className="text-primary flex items-center gap-4 font-serif text-[32px] leading-none font-normal tracking-[-0.02em]">
					<ProjectIcon
						name={name}
						icon={icon}
						size={44}
						className="shadow-sm"
					/>
					{name}
				</h2>

				<div className="mt-4 flex flex-wrap items-center gap-2">
					<p className="text-secondary text-sm">{roleLine}</p>

					{label != null && (
						<span className="project-status-pill">{label}</span>
					)}
				</div>

				<p className="text-primary mt-3 text-[17px] leading-[1.6] text-pretty">
					{summary}
				</p>

				<div className="mt-2.5">
					<ViewProjectLink
						slug={slug}
						name={name}
						decorationClassName="decoration-(--project-accent)"
					/>
				</div>
			</div>

			{/* Set into the corner: the crop shows the top 530 of the image's 760
			    rows, flush with the card's right and bottom edges, so only its
			    top-left corner is rounded. */}
			{featuredImage != null && (
				<div className="flex min-w-0 items-end pl-7 min-[900px]:pt-11 min-[900px]:pl-0">
					<div className="aspect-[1270/530] w-full overflow-hidden">
						<div className="relative aspect-[1270/760] overflow-hidden rounded-tl-xl">
							<Image
								src={featuredImage}
								alt={`${name} screenshot`}
								fill
								sizes={IMAGE_SIZES}
								className="object-cover"
							/>
						</div>
					</div>
				</div>
			)}
		</article>
	)
}
