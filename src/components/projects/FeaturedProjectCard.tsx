import Image from "next/image"
import Link from "next/link"
import { compactLabel } from "@/lib/utils/platforms"
import type { ProjectGalleryItem } from "@/lib/db/projects"
import type { ReactNode } from "react"

interface Props {
	project: ProjectGalleryItem
	href?: string
	isPriority?: boolean
	children?: ReactNode
}

export default function FeaturedProjectCard({
	project,
	href: hrefProp,
	isPriority = false,
	children,
}: Props) {
	const {
		name,
		slug,
		summary,
		icon,
		heroImage,
		bucket,
		platformTags,
		role,
		accentColor,
		isDiscontinued,
	} = project
	const href = hrefProp ?? `/projects/${slug}`
	const accent = accentColor ?? "var(--color-accent)"

	return (
		<div className="group relative transition-all duration-500 hover:-translate-y-1">
			{/* Accent glow — absolutely positioned behind the card, fades in on hover */}
			<div
				className="pointer-events-none absolute inset-0 -z-10 rounded-2xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-15 dark:group-hover:opacity-25"
				style={{ backgroundColor: accent }}
			/>

			<Link
				href={href}
				className="relative flex flex-col overflow-hidden rounded-2xl border border-(--color-border) bg-(--color-background)"
			>
				{/* Hero image */}
				<div className="relative aspect-video overflow-hidden bg-(--color-border)">
					{heroImage ? (
						<Image
							src={heroImage}
							alt={`${name} screenshot`}
							fill
							priority={isPriority}
							className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
							sizes="(max-width: 768px) 100vw, 50vw"
						/>
					) : (
						<div
							className="absolute inset-0 opacity-10"
							style={{ backgroundColor: accent }}
						/>
					)}

					{isDiscontinued && (
						<span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white/80 backdrop-blur-sm">
							Discontinued
						</span>
					)}
				</div>

				{/* Card body */}
				<div className="flex flex-1 flex-col gap-3 p-5">
					<div className="flex items-start gap-3">
						{icon && (
							<Image
								src={icon}
								alt={`${name} icon`}
								width={44}
								height={44}
								className="shrink-0 rounded-xl"
							/>
						)}

						<div className="min-w-0 flex-1">
							<h3 className="text-primary text-lg leading-snug font-semibold">
								{name}
							</h3>

							<div className="mt-1 flex flex-wrap items-center gap-2">
								<span
									className="rounded-full px-2 py-0.5 text-xs font-medium"
									style={{
										backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
										color: accent,
									}}
								>
									{compactLabel(bucket, platformTags)}
								</span>

								{role && <span className="text-secondary text-xs">{role}</span>}
							</div>
						</div>
					</div>

					<p className="text-secondary line-clamp-3 text-sm leading-relaxed">
						{summary}
					</p>

					<span
						className="mt-auto text-sm font-medium transition-colors duration-300"
						style={{ color: accent }}
					>
						View project <span aria-hidden>→</span>
					</span>
				</div>
			</Link>

			{children}
		</div>
	)
}
