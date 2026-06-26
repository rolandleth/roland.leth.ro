"use client"

import { AnimatePresence, motion } from "framer-motion"
import Image from "next/image"
import { useEffect, useRef, useState } from "react"
import { useScrollOverflow } from "@/components/ui/useScrollOverflow"
import { fadeUp } from "@/lib/client/motion"
import { detailLabel } from "@/lib/utils/platforms"
import ProjectImageLightbox from "./ProjectImageLightbox"
import ProjectSectionCarousel from "./ProjectSectionCarousel"
import type { ProjectDetail } from "@/lib/db/projects"
import type { ReactNode } from "react"

interface Props {
	project: ProjectDetail
	renderedDescriptions: ReactNode[]
}

export default function ProjectContent({
	project,
	renderedDescriptions,
}: Props) {
	const {
		name,
		summary,
		icon,
		bucket,
		platformTags,
		role,
		accentColor,
		isDiscontinued,
		sections,
		links,
	} = project
	const accent = accentColor ?? "var(--color-accent)"
	const [activeTab, setActiveTab] = useState(0)
	// Position within the active section's images. Lifted here (rather than owned
	// by the carousel) so the arrows, dots, and lightbox share one position and
	// the arrows can walk across section boundaries into the next/prev section.
	const [imageIndex, setImageIndex] = useState(0)
	// Direction of the last image move, so the carousel slide pushes the right
	// way. The carousel can't derive it from `index` alone without reading a ref
	// during render (which the lint rules forbid), so the owner of the index
	// tracks it.
	const [slideDirection, setSlideDirection] = useState(0)
	const [isLightboxOpen, setIsLightboxOpen] = useState(false)
	// Refs to each tab button so arrow-key navigation can move focus along
	// with selection (APG roving-tabindex pattern).
	const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
	// Drives the edge fades that hint the tablist scrolls horizontally when the
	// section titles overflow the available width.
	const tablistRef = useRef<HTMLDivElement | null>(null)
	const { canScrollStart, canScrollEnd } = useScrollOverflow(tablistRef)
	// Skip the mount run so the page doesn't auto-scroll the tablist into view on
	// load; only react to genuine tab changes.
	const isInitialTabRender = useRef(true)

	const activeSection = sections[activeTab]
	const sectionsWithImages = sections.filter(
		(section) => section.images.length > 0
	).length
	// There's somewhere to navigate if the current section has more than one
	// image, or another section holds images the arrows can cross into.
	const canNavigateGallery =
		activeSection != null &&
		(activeSection.images.length > 1 || sectionsWithImages > 1)

	// Keep the selected tab visible in the scrollable tablist. Crossing sections
	// from inside the lightbox (or via the arrows) changes `activeTab` without
	// moving focus, so without this the highlighted tab can sit scrolled out of
	// view — e.g. you walk to a later section in fullscreen, close it, and the
	// tablist is still parked at the start with nothing visibly selected.
	useEffect(() => {
		if (isInitialTabRender.current) {
			isInitialTabRender.current = false
			return
		}

		tabRefs.current[activeTab]?.scrollIntoView({
			block: "nearest",
			inline: "nearest",
		})
	}, [activeTab])

	function goToSection(index: number) {
		setActiveTab(index)
		setImageIndex(0)
		setSlideDirection(0)
	}

	// Jump straight to a dot's image within the active section.
	function selectImage(target: number) {
		setSlideDirection(target > imageIndex ? 1 : -1)
		setImageIndex(target)
	}

	function selectTab(index: number) {
		goToSection(index)
		tabRefs.current[index]?.focus()
	}

	// Cyclically finds the nearest section in `direction` that actually has
	// images, so the arrows skip image-less sections instead of stranding the
	// gallery on one. Returns `null` when no other section has images.
	function findAdjacentImageSection(
		from: number,
		direction: 1 | -1
	): number | null {
		const count = sections.length

		for (let step = 1; step < count; step++) {
			const index = (((from + direction * step) % count) + count) % count

			if (sections[index].images.length > 0) {
				return index
			}
		}

		return null
	}

	// Walks the whole gallery: advances within the section until its images run
	// out, then crosses into the adjacent section (switching the active tab).
	function navigateImage(direction: 1 | -1) {
		const images = activeSection?.images ?? []
		const nextIndex = imageIndex + direction
		setSlideDirection(direction)

		if (nextIndex >= 0 && nextIndex < images.length) {
			setImageIndex(nextIndex)
			return
		}

		const adjacent = findAdjacentImageSection(activeTab, direction)

		if (adjacent === null) {
			// This is the only section with images — wrap within it.
			setImageIndex(direction === 1 ? 0 : images.length - 1)
			return
		}

		setActiveTab(adjacent)
		// Forward lands on the first image of the next section; backward lands on
		// the last image of the previous one.
		setImageIndex(direction === 1 ? 0 : sections[adjacent].images.length - 1)
	}

	function handleTabKeyDown(
		event: React.KeyboardEvent<HTMLButtonElement>,
		index: number
	) {
		const last = sections.length - 1

		switch (event.key) {
			case "ArrowRight":
				event.preventDefault()
				selectTab(index === last ? 0 : index + 1)
				break
			case "ArrowLeft":
				event.preventDefault()
				selectTab(index === 0 ? last : index - 1)
				break
			case "Home":
				event.preventDefault()
				selectTab(0)
				break
			case "End":
				event.preventDefault()
				selectTab(last)
				break
		}
	}

	return (
		<>
			{/* The header gradient in globals.css reads `--color-header-accent`;
			    rendering this rule via JSX (instead of a useEffect on mount) puts
			    the override in the first paint, so SPA navigation between project
			    pages doesn't flash through the default accent between unmount
			    cleanup and remount effect. */}
			{accentColor && (
				<style>{`:root { --color-header-accent: ${accentColor}; }`}</style>
			)}

			{/* Project-specific glow */}
			<div
				aria-hidden
				className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 opacity-[0.12] dark:opacity-[0.2]"
				style={{
					background: `radial-gradient(ellipse 80% 100% at 50% 0%, ${accent}, transparent)`,
				}}
			/>

			<div className="mx-auto w-full max-w-3xl px-4 py-20">
				{/* Identity row + links */}
				<motion.div
					className="mb-8 flex items-center justify-between gap-6"
					{...fadeUp(0.1)}
				>
					{/* Left: icon + name + platform/role */}
					<div className="flex items-start gap-4">
						{icon ? (
							<Image
								src={icon}
								alt={`${name} icon`}
								width={72}
								height={72}
								className="shrink-0 rounded-2xl shadow-sm"
								priority
							/>
						) : (
							<div
								className="flex h-18 w-18 shrink-0 items-center justify-center rounded-2xl shadow-sm"
								style={{
									backgroundColor: `color-mix(in srgb, ${accent} 15%, var(--color-border))`,
								}}
							>
								<span className="text-2xl font-bold" style={{ color: accent }}>
									{name.charAt(0)}
								</span>
							</div>
						)}

						<div className="min-w-0">
							<div className="flex flex-wrap items-center gap-3">
								<h1 className="text-primary text-3xl font-bold">{name}</h1>

								{isDiscontinued && (
									<span className="rounded-full bg-(--color-border) px-2.5 py-0.5 text-xs font-medium text-(--color-secondary)">
										Discontinued
									</span>
								)}
							</div>

							<div className="mt-2 flex flex-wrap items-center gap-2">
								<span
									className="rounded-full px-2.5 py-0.5 text-xs font-medium"
									style={{
										backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
										color: accent,
									}}
								>
									{/* Detail view renders the honest, full stack; the compact `compactLabel` is for list/gallery views. */}
									{detailLabel(bucket, platformTags)}
								</span>

								{role && <span className="text-secondary text-sm">{role}</span>}
							</div>
						</div>
					</div>

					{/* Right: links grid */}
					{links.length > 0 && (
						<div
							className={`grid shrink-0 grid-flow-col gap-2 ${links.length === 1 ? "grid-rows-1" : "grid-rows-2"}`}
						>
							{links.map((link) => (
								<a
									key={link.id}
									href={link.url}
									target="_blank"
									rel="noopener noreferrer"
									className="rounded-full border px-4 py-1.5 text-center text-sm font-medium transition-opacity duration-300 hover:opacity-80"
									style={{
										color: accent,
										borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
									}}
								>
									{link.label}
								</a>
							))}
						</div>
					)}
				</motion.div>

				{/* Summary */}
				<motion.p
					className="text-secondary mb-10 text-lg leading-relaxed"
					{...fadeUp(0.15)}
				>
					{summary}
				</motion.p>

				{/* Hero image (no-sections fallback) */}
				{sections.length === 0 && project.heroImage && (
					<motion.div className="overflow-hidden rounded-xl" {...fadeUp(0.2)}>
						<div className="relative h-120">
							<Image
								src={project.heroImage}
								alt={`${name} screenshot`}
								fill
								sizes="(max-width: 768px) calc(100vw - 2rem), 736px"
								className="object-contain"
								priority
							/>
						</div>
					</motion.div>
				)}

				{/* Section tabs */}
				{sections.length > 0 && (
					<motion.div {...fadeUp(0.2)}>
						{sections.length > 1 && (
							<div className="relative mb-4">
								{/* Edge fades hint that more tabs sit off-screen; each
								    appears only while there's hidden content on its side. */}
								<div
									aria-hidden
									className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-(--color-background) via-(--color-background)/80 to-transparent transition-opacity duration-200 ${canScrollStart ? "opacity-100" : "opacity-0"}`}
								/>
								<div
									aria-hidden
									className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-(--color-background) via-(--color-background)/80 to-transparent transition-opacity duration-200 ${canScrollEnd ? "opacity-100" : "opacity-0"}`}
								/>

								<div
									ref={tablistRef}
									role="tablist"
									aria-label="Project sections"
									className="flex gap-1 overflow-x-auto border-b border-(--color-border)"
								>
									{sections.map((section, i) => (
										<button
											key={`tab-${section.id}`}
											ref={(node) => {
												tabRefs.current[i] = node
											}}
											type="button"
											role="tab"
											id={`tab-${section.id}`}
											aria-selected={i === activeTab}
											aria-controls={`panel-${section.id}`}
											// Roving tabIndex: only the active tab is in the page's
											// tab order; arrow keys move focus between the rest.
											// Without this, Tab cycles through every tab button,
											// which is the wrong APG behaviour for a tablist.
											tabIndex={i === activeTab ? 0 : -1}
											onClick={() => goToSection(i)}
											onKeyDown={(e) => handleTabKeyDown(e, i)}
											className="relative shrink-0 cursor-pointer px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-300"
											style={{
												color:
													i === activeTab ? accent : "var(--color-secondary)",
											}}
										>
											{section.title}

											{i === activeTab && (
												<span
													aria-hidden
													className="absolute right-0 bottom-0 left-0 h-0.5"
													style={{ backgroundColor: accent }}
												/>
											)}
										</button>
									))}
								</div>
							</div>
						)}

						<AnimatePresence mode="wait">
							{activeSection && (
								<motion.div
									key={activeSection.id}
									role="tabpanel"
									id={`panel-${activeSection.id}`}
									aria-labelledby={`tab-${activeSection.id}`}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									exit={{ opacity: 0, y: -8 }}
									transition={{ duration: 0.2 }}
								>
									{activeSection.images.length > 0 && (
										<div className="mb-6">
											<ProjectSectionCarousel
												images={activeSection.images}
												index={imageIndex}
												direction={slideDirection}
												altPrefix={activeSection.title}
												onSelectImage={selectImage}
												onEnlarge={() => setIsLightboxOpen(true)}
											/>
										</div>
									)}

									{sections.length === 1 && (
										<h2
											className="mb-4 text-xl font-semibold"
											style={{ color: accent }}
										>
											{activeSection.title}
										</h2>
									)}

									<div className="prose dark:prose-invert max-w-none">
										{renderedDescriptions[activeTab]}
									</div>
								</motion.div>
							)}
						</AnimatePresence>

						{/* One lightbox for the whole gallery, kept outside the tabpanel
						    so it survives section changes — the arrows walk across
						    sections without the overlay flickering closed. */}
						{activeSection && activeSection.images.length > 0 && (
							<ProjectImageLightbox
								isOpen={isLightboxOpen}
								images={activeSection.images}
								index={imageIndex}
								altPrefix={activeSection.title}
								canNavigate={canNavigateGallery}
								onClose={() => setIsLightboxOpen(false)}
								onPrev={() => navigateImage(-1)}
								onNext={() => navigateImage(1)}
							/>
						)}
					</motion.div>
				)}
			</div>
		</>
	)
}
