import {
	ProjectSectionKind,
	ProjectSectionLayout,
} from "@/generated/prisma/enums"
import { flattenGroups } from "@/lib/client/gallery"
import { resolveHeroImage } from "@/lib/db/projects"
import { linkCtasFor } from "@/lib/utils/platforms"
import {
	AUTOMATIC_PRICING_ANCHOR,
	groupOffersByPlan,
	productGalleryGroups,
	reservedAnchors,
	sectionAnchors,
} from "@/lib/utils/productPage"
import ProjectGuides from "../ProjectGuides"
import ProjectLinkCta from "../ProjectLinkCta"
import ProductClosing from "./ProductClosing"
import ProductFaq from "./ProductFaq"
import { ProductGalleryProvider } from "./ProductGallery"
import ProductHero from "./ProductHero"
import ProductPageStyle from "./ProductPageStyle"
import { ProductPricingSection } from "./ProductPlans"
import { PRODUCT_PROSE_CLASS, ProductTextSection } from "./ProductSection"
import ProductStepsSection from "./ProductSteps"
import { ProductToc, ProductTocCompact } from "./ProductToc"
import type { Pricing } from "./ProductPlans"
import type { TocItem } from "./ProductToc"
import type { GuideLinkItem } from "@/lib/content/guideLinks"
import type { ProjectDetail } from "@/lib/db/projects"
import type { ReactNode } from "react"

interface Props {
	project: ProjectDetail
	/** Rendered section bodies, aligned by index with `project.sections`. */
	renderedDescriptions: readonly ReactNode[]
	/**
	 * Rendered step bodies, aligned by index with `project.sections`, then with
	 * each section's `items`.
	 */
	renderedItemDescriptions: readonly (readonly ReactNode[])[]
	/** Rendered FAQ answers, aligned by index with `project.faqs`. */
	renderedFaqAnswers: readonly ReactNode[]
	/** Topic hubs and ungrouped guides naming this project; empty when none. */
	guides: readonly GuideLinkItem[]
}

/** An intro or a note left empty is stored as "": nothing to render. */
function hasText(markdown: string): boolean {
	return markdown.trim() !== ""
}

/**
 * What the page prices, or null when there's nothing to show: no offers, or a
 * discontinued app (nothing left to buy).
 */
function pricingFor(project: ProjectDetail): Pricing | null {
	if (project.isDiscontinued) {
		return null
	}

	const plans = groupOffersByPlan(project.plans, project.offers)

	if (plans != null) {
		return { kind: "plans", plans }
	}

	if (project.offers != null && project.offers.length > 0) {
		return { kind: "offers", offers: project.offers }
	}

	return null
}

/**
 * The project page for `pageLayout: product`: a product page rather than the
 * tabbed portfolio entry. Every section is on the page at
 * once, each with its own `h2` and anchor, so search engines and answer engines
 * read all of it; prices print as text; the page ends on the store button.
 *
 * Server-rendered. Only the carousels and lightbox (`ProductGalleryProvider`),
 * the section list's current-section marker (`ProductToc`) and the guides
 * block are client components.
 *
 * Order: hero, sections (text, steps, and the plan cards in a `pricing`
 * section, or in an automatic "Pricing" block of their own when there's none),
 * FAQ, closing, guides, then the disclaimer and the remaining links.
 */
export default function ProductPage({
	project,
	renderedDescriptions,
	renderedItemDescriptions,
	renderedFaqAnswers,
	guides,
}: Props) {
	const { name, sections, faqs } = project
	const pricing = pricingFor(project)
	const hasAutomaticPricing =
		pricing != null &&
		!sections.some((section) => section.kind === ProjectSectionKind.pricing)
	const anchors = sectionAnchors(
		sections.map((section) => section.title),
		reservedAnchors(hasAutomaticPricing)
	)
	const linkCtas = linkCtasFor(project)
	const storeLinks = linkCtas.filter(({ cta }) => cta.kind !== "plainPill")
	const otherLinks = linkCtas.filter(({ cta }) => cta.kind === "plainPill")
	const stepsIndex = sections.findIndex(
		(section) => section.kind === ProjectSectionKind.steps
	)
	const { groups, sectionGroups, stepGroups } = productGalleryGroups(sections)
	const gallery = flattenGroups(groups)
	const heroImage = resolveHeroImage(project)
	// A `pricing` section with nothing to price (a discontinued app) would be a
	// heading over nothing, so it's left off the page and the section list.
	const isShown = (section: (typeof sections)[number]) =>
		section.kind !== ProjectSectionKind.pricing || pricing != null
	const [primaryStoreLink] = storeLinks
	// A flex row, so the badge sits at its own width on the left: it carries
	// `justify-self-center` for the tabbed layout's link grid, which browsers
	// now apply in block layout too.
	const storeButton =
		primaryStoreLink == null ? null : (
			<div className="flex">
				<ProjectLinkCta
					url={primaryStoreLink.link.url}
					cta={primaryStoreLink.cta}
					accent="var(--project-accent)"
				/>
			</div>
		)
	const tocItems: TocItem[] = [
		...sections.flatMap((section, index) =>
			isShown(section) ? [{ id: anchors[index], title: section.title }] : []
		),
		...(hasAutomaticPricing
			? [{ id: AUTOMATIC_PRICING_ANCHOR, title: "Pricing" }]
			: []),
		...(faqs.length > 0 ? [{ id: "faq", title: "FAQ" }] : []),
	]

	function renderSection(
		section: (typeof sections)[number],
		index: number
	): ReactNode {
		const id = anchors[index]

		switch (section.kind) {
			case ProjectSectionKind.text:
				return (
					<ProductTextSection
						key={section.id}
						id={id}
						title={section.title}
						// A row written before layouts existed rendered stacked.
						layout={section.layout ?? ProjectSectionLayout.stacked}
						galleryIndex={sectionGroups[index]}
						galleryLabel={`${name}: ${section.title}`}
						body={renderedDescriptions[index]}
					/>
				)
			case ProjectSectionKind.steps:
				return (
					<ProductStepsSection
						key={section.id}
						id={id}
						title={section.title}
						intro={
							hasText(section.description) ? renderedDescriptions[index] : null
						}
						steps={section.items.map((item, itemIndex) => ({
							id: item.id,
							title: item.title,
							body: renderedItemDescriptions[index][itemIndex],
							galleryIndex: stepGroups[index][itemIndex],
						}))}
						projectName={name}
					/>
				)
			case ProjectSectionKind.pricing:
				return pricing == null ? null : (
					<ProductPricingSection
						key={section.id}
						id={id}
						title={section.title}
						pricing={pricing}
						note={
							hasText(section.description) ? (
								<div className={PRODUCT_PROSE_CLASS}>
									{renderedDescriptions[index]}
								</div>
							) : null
						}
						storeButton={storeButton}
					/>
				)
		}
	}
	const hasMeta = project.disclaimer != null || otherLinks.length > 0

	return (
		<div className="product-page flex flex-1 flex-col">
			<ProductPageStyle
				accentColor={project.accentColor}
				palette={project.palette}
			/>

			<ProductHero
				name={name}
				icon={project.icon}
				eyebrow={project.heroEyebrow}
				headline={project.heroHeadline}
				summary={project.summary}
				heroImage={heroImage}
				heroImageAlt={project.heroImageAlt}
				isDiscontinued={project.isDiscontinued}
				storeLinks={storeLinks}
				stepsAnchor={stepsIndex === -1 ? null : anchors[stepsIndex]}
				storeNote={project.storeNote}
			/>

			{/* The section list takes a 200px first column of the frame from
			    1080px, which leaves 840px for the sections at full width; below
			    that it collapses into a list above them. Shown on every page,
			    short ones included: it balances the frame and the long column. */}
			<div className="product-frame min-[1080px]:grid min-[1080px]:grid-cols-[200px_minmax(0,1fr)] min-[1080px]:gap-16">
				<ProductToc items={tocItems} />

				<div className="min-w-0">
					<ProductTocCompact items={tocItems} />

					{/* One image on the page loads with `priority`: the hero image when
					    there is one, else the first screenshot. */}
					<ProductGalleryProvider
						images={gallery}
						galleryLabel={name}
						isFirstImagePriority={heroImage == null}
					>
						{sections.map(renderSection)}
					</ProductGalleryProvider>

					{hasAutomaticPricing && (
						<ProductPricingSection
							id={AUTOMATIC_PRICING_ANCHOR}
							title="Pricing"
							pricing={pricing}
							note={
								(project.offers ?? []).every(
									(offer) => offer.priceCurrency === "USD"
								) ? (
									<p className="text-secondary text-sm">
										US prices. The App Store shows yours.
									</p>
								) : null
							}
							storeButton={storeButton}
						/>
					)}

					{faqs.length > 0 && (
						<ProductFaq faqs={faqs} renderedAnswers={renderedFaqAnswers} />
					)}
				</div>
			</div>

			<ProductClosing
				name={name}
				icon={project.icon}
				headline={project.closingHeadline}
				body={project.closingBody}
				storeLinks={storeLinks}
				storeNote={project.storeNote}
			/>

			{(guides.length > 0 || hasMeta) && (
				<div className="product-frame pb-16">
					{guides.length > 0 && (
						<ProjectGuides items={guides} accent="var(--project-accent)" />
					)}

					{hasMeta && (
						<div className="text-secondary flex flex-col gap-3 pt-14 text-sm leading-relaxed">
							{project.disclaimer != null && (
								<p className="max-w-[64em]">{project.disclaimer}</p>
							)}

							{otherLinks.length > 0 && (
								<div className="flex flex-wrap items-center gap-x-4 gap-y-1">
									{otherLinks.map(({ link }) => (
										<a
											key={link.id}
											href={link.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-primary inline-flex min-h-8 items-center underline decoration-(--color-border) underline-offset-4"
										>
											{link.label}
										</a>
									))}
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
