"use client"

import { motion } from "framer-motion"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState } from "react"
import { useScrollOverflow } from "@/components/ui/useScrollOverflow"
import { firstIndexOfSection, flattenSections } from "@/lib/client/gallery"
import { fadeUp } from "@/lib/client/motion"
import { detailLabel } from "@/lib/utils/platforms"
import ProjectFaq from "./ProjectFaq"
import ProjectGuides from "./ProjectGuides"
import ProjectImageLightbox from "./ProjectImageLightbox"
import ProjectSectionCarousel from "./ProjectSectionCarousel"
import type { GuideLinkItem } from "@/lib/content/guideLinks"
import type { ProjectDetail } from "@/lib/db/projects"
import type { ReactNode } from "react"

interface Props {
	project: ProjectDetail
	renderedDescriptions: ReactNode[]
	renderedFaqAnswers: ReactNode[]
	/** Topic hubs and ungrouped guides naming this project; empty when it has none. */
	guides: readonly GuideLinkItem[]
}

/** Shared pill styling for the hero links grid and the standalone store CTA below the content. */
const ctaPillClass =
	"rounded-full border px-4 py-1.5 text-center text-sm font-medium transition-opacity duration-300 hover:opacity-80"

export default function ProjectContent({
	project,
	renderedDescriptions,
	renderedFaqAnswers,
	guides,
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
		faqs,
	} = project
	const accent = accentColor ?? "var(--color-accent)"
	// The primary storefront link, repeated as a standalone CTA below the content
	// — by then the hero pill has long scrolled off-screen. `find` takes the
	// lowest-`sortOrder` storefront when a project lists several (an iOS and a
	// Mac listing are both `apps.apple.com`), so the author picks the primary one
	// by ordering the links. Discontinued projects are excluded: a prominent
	// "Get on …" asserts availability the Discontinued badge contradicts.
	const storeLink = isDiscontinued
		? undefined
		: links.find((link) => isStoreUrl(link.url))
	const [activeTab, setActiveTab] = useState(0)
	// Every section's images flattened into one continuous gallery. The carousel
	// and lightbox both slide across this whole strip; each slide carries its
	// owning section so navigation can keep the active tab in step.
	const galleryImages = useMemo(() => flattenSections(sections), [sections])
	const galleryCount = galleryImages.length
	// Flat position within `galleryImages`. Lifted here (rather than owned by the
	// carousel) so the dots, the drag, and the lightbox share one position and
	// crossing a section boundary can move the active tab with it.
	const [galleryIndex, setGalleryIndex] = useState(0)
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
	// There's somewhere to navigate whenever the gallery holds more than one
	// slide, regardless of which section they live in.
	const canNavigateGallery = galleryCount > 1

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

	// Select a section from the tablist: show its description and, when it holds
	// images, move the continuous gallery to its first slide. Image-less sections
	// leave the gallery position alone (the carousel is hidden for them anyway).
	function goToSection(index: number) {
		setActiveTab(index)

		const first = firstIndexOfSection(galleryImages, index)

		if (first !== -1) {
			setGalleryIndex(first)
		}
	}

	// Jump the gallery to an arbitrary flat index (a dot tap, or the slide a drag
	// settled on), syncing the active tab to the section that owns that slide so
	// the underline and the description follow the picture.
	function goToImage(flatIndex: number) {
		if (galleryCount === 0) {
			return
		}

		const clamped = Math.max(0, Math.min(flatIndex, galleryCount - 1))
		setGalleryIndex(clamped)
		setActiveTab(galleryImages[clamped].sectionIndex)
	}

	// Page one slide with wrap-around across the whole gallery (arrows / keys).
	function stepImage(direction: 1 | -1) {
		if (galleryCount === 0) {
			return
		}

		const next =
			(((galleryIndex + direction) % galleryCount) + galleryCount) %
			galleryCount
		goToImage(next)
	}

	function selectTab(index: number) {
		goToSection(index)
		tabRefs.current[index]?.focus()
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
				{/* Identity row + links. Stacked below `sm`: the links grid is
				    `shrink-0` and a single `Get on …` pill is ~148px, which together
				    with the icon and the title's min-content width overflows a 375px
				    viewport and gives the whole page a horizontal scrollbar. */}
				<motion.div
					className="mb-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
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
									className={ctaPillClass}
									style={{
										color: accent,
										borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
									}}
								>
									{ctaLabel(link, isDiscontinued)}
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
									className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-(--color-background) to-(--color-background-transparent) transition-opacity duration-200 ${canScrollStart ? "opacity-100" : "opacity-0"}`}
								/>
								<div
									aria-hidden
									className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-(--color-background) to-(--color-background-transparent) transition-opacity duration-200 ${canScrollEnd ? "opacity-100" : "opacity-0"}`}
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

						{activeSection && (
							// Deliberately NOT keyed on the section: the continuous carousel
							// lives inside this panel, and a per-section key would remount it
							// on every cross-section move — resetting its slide strip to 0 and
							// springing it across every slide (an accelerated fly-across)
							// instead of stepping one slide. The panel's id/aria-labelledby
							// swap as attributes on the same element instead.
							<div
								role="tabpanel"
								id={`panel-${activeSection.id}`}
								aria-labelledby={`tab-${activeSection.id}`}
							>
								{activeSection.images.length > 0 && (
									<div className="mb-6">
										<ProjectSectionCarousel
											images={galleryImages}
											index={galleryIndex}
											canNavigate={canNavigateGallery}
											galleryLabel={name}
											onSelectImage={goToImage}
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
							</div>
						)}

						{/* One lightbox for the whole gallery, kept outside the tabpanel
						    so it survives section changes — the arrows walk across
						    sections without the overlay flickering closed. */}
						{galleryCount > 0 && (
							<ProjectImageLightbox
								isOpen={isLightboxOpen}
								images={galleryImages}
								index={galleryIndex}
								galleryLabel={name}
								canNavigate={canNavigateGallery}
								onClose={() => setIsLightboxOpen(false)}
								onPrev={() => stepImage(-1)}
								onNext={() => stepImage(1)}
							/>
						)}
					</motion.div>
				)}

				{/* Store CTA repeated above the guides, mirroring the hero pill. */}
				{storeLink && (
					<motion.div className="mt-12 flex justify-center" {...fadeUp(0.2)}>
						<a
							href={storeLink.url}
							target="_blank"
							rel="noopener noreferrer"
							className={ctaPillClass}
							style={{
								color: accent,
								borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
							}}
						>
							{ctaLabel(storeLink, isDiscontinued)}
						</a>
					</motion.div>
				)}

				{/* Guides — below the content, above the FAQ. */}
				{guides.length > 0 && <ProjectGuides items={guides} accent={accent} />}

				{/* FAQ — last on the page, below the gallery + description. */}
				{faqs.length > 0 && (
					<ProjectFaq
						faqs={faqs}
						renderedAnswers={renderedFaqAnswers}
						accent={accent}
					/>
				)}
			</div>
		</>
	)
}

/**
 * Storefront links render as a call to action ("Get on Mac App Store"); other
 * links (GitHub, a project site) keep their bare label. Keyed off the URL, not
 * the label, so copy edits can't change which links get the prefix.
 *
 * A discontinued project keeps the bare label on its storefront link too — the
 * listing stays reachable, it just stops being sold.
 */
function ctaLabel(
	link: { label: string; url: string },
	isDiscontinued: boolean
): string {
	return isStoreUrl(link.url) && !isDiscontinued
		? `Get on ${link.label}`
		: link.label
}

/**
 * Hostnames that count as a storefront. Apple-only because that's every
 * storefront the projects carry today; another store (Play, Setapp, a direct
 * download) renders as a plain link until its host is added here.
 */
const STORE_HOSTNAMES: ReadonlySet<string> = new Set(["apps.apple.com"])

/** True for storefront URLs; a malformed URL is treated as a non-store link. */
function isStoreUrl(url: string): boolean {
	try {
		return STORE_HOSTNAMES.has(new URL(url).hostname)
	} catch {
		return false
	}
}
