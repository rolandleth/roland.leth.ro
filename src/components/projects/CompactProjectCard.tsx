import Image from "next/image"
import Link from "next/link"
import { formatPlatformDisplay } from "@/lib/platforms"
import type { ProjectGalleryItem } from "@/lib/projects"
import type { ReactNode } from "react"

interface Props {
	project: ProjectGalleryItem
	href?: string
	/** Hide the platform capsule when the platform matches the section label exactly — the section header already communicates it. */
	showPlatformCapsule?: boolean
	children?: ReactNode
}

export default function CompactProjectCard({
	project,
	href: hrefProp,
	showPlatformCapsule = true,
	children,
}: Props) {
	const { name, slug, icon, platform, accentColor, isDiscontinued } = project
	const accent = accentColor ?? "var(--color-accent)"
	// Featured projects link to their detail page; others link externally if needed, but we still use the detail route as a fallback.
	const href = hrefProp ?? `/projects/${slug}`

	return (
		<div
			className={`group transition-all duration-300 hover:-translate-y-0.5 ${
				isDiscontinued ? "opacity-50 grayscale" : ""
			}`}
		>
			<Link
				href={href}
				className="flex flex-col items-center gap-2.5 rounded-xl p-3 text-center hover:bg-(--color-background)"
			>
				<div className="relative">
					<div
						className="overflow-hidden rounded-2xl shadow-sm transition-shadow duration-300 group-hover:shadow-md"
						style={
							!isDiscontinued
								? {
										boxShadow: `0 0 0 1px color-mix(in srgb, ${accent} 20%, transparent)`,
									}
								: undefined
						}
					>
						{icon ? (
							<Image
								src={icon}
								alt={`${name} icon`}
								width={64}
								height={64}
								className="block"
							/>
						) : (
							<div
								className="flex h-16 w-16 items-center justify-center"
								style={{
									backgroundColor: `color-mix(in srgb, ${accent} 15%, var(--color-border))`,
								}}
							>
								<span className="text-xl font-bold" style={{ color: accent }}>
									{name.charAt(0)}
								</span>
							</div>
						)}
					</div>

					{showPlatformCapsule && (
						<span className="text-secondary absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full border border-(--color-border) bg-(--color-background-value)/90 px-1.5 py-0.5 text-[9px] whitespace-nowrap backdrop-blur-sm">
							{formatPlatformDisplay(platform)}
						</span>
					)}
				</div>

				<span className="text-secondary mt-2 line-clamp-2 w-[calc(100%-10px)] text-center text-xs leading-tight transition-colors duration-300 group-hover:text-(--color-primary)">
					{name}
				</span>
			</Link>

			{children}
		</div>
	)
}
