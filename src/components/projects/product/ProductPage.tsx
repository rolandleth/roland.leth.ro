import { flattenSections } from "@/lib/client/gallery"
import { resolveHeroImage } from "@/lib/db/projects"
import { linkCtasFor } from "@/lib/utils/platforms"
import {
	groupOffersByPlan,
	hasNumberedSteps,
	sectionAnchors,
	TOC_MIN_SECTIONS,
} from "@/lib/utils/productPage"
import ProjectGuides from "../ProjectGuides"
import ProjectLinkCta from "../ProjectLinkCta"
import ProductClosing from "./ProductClosing"
import ProductFaq from "./ProductFaq"
import { ProductGalleryProvider } from "./ProductGallery"
import ProductHero from "./ProductHero"
import ProductPageStyle from "./ProductPageStyle"
import ProductPlans from "./ProductPlans"
import ProductSection, { PRODUCT_H2_CLASS } from "./ProductSection"
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
	/** Rendered FAQ answers, aligned by index with `project.faqs`. */
	renderedFaqAnswers: readonly ReactNode[]
	/** Topic hubs and ungrouped guides naming this project; empty when none. */
	guides: readonly GuideLinkItem[]
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
 * The project page of an app Roland makes and sells (`isOwnApp`): a product
 * page rather than the tabbed portfolio entry. Every section is on the page at
 * once, each with its own `h2` and anchor, so search engines and answer engines
 * read all of it; prices print as text; the page ends on the store button.
 *
 * Server-rendered. Only the carousels and lightbox (`ProductGalleryProvider`),
 * the section list's current-section marker (`ProductToc`) and the guides
 * block are client components.
 *
 * Order: hero, sections (the plan cards inside the section that holds them, or
 * a "Pricing" section of their own), FAQ, closing, guides, then the disclaimer
 * and the remaining links.
 */
export default function ProductPage({
	project,
	renderedDescriptions,
	renderedFaqAnswers,
	guides,
}: Props) {
	const { name, sections, faqs } = project
	const anchors = sectionAnchors(sections.map((section) => section.title))
	const linkCtas = linkCtasFor(project)
	const storeLinks = linkCtas.filter(({ cta }) => cta.kind !== "plainPill")
	const otherLinks = linkCtas.filter(({ cta }) => cta.kind === "plainPill")
	const stepsIndex = sections.findIndex((section) =>
		hasNumberedSteps(section.description)
	)
	const gallery = flattenSections(sections)
	const heroImage = resolveHeroImage(project)
	// One image on the page loads with `priority`: the hero image when there
	// is one, else the first screenshot.
	const priorityImageId = heroImage == null ? (gallery[0]?.id ?? null) : null
	const pricing = pricingFor(project)
	const plansIndex = sections.findIndex((section) => section.hasPlans)
	const hasPricingSection = pricing != null && plansIndex === -1
	const [primaryStoreLink] = storeLinks
	const storeButton =
		primaryStoreLink == null ? null : (
			<div>
				<ProjectLinkCta
					url={primaryStoreLink.link.url}
					cta={primaryStoreLink.cta}
					accent="var(--project-accent)"
				/>
			</div>
		)
	const tocItems: TocItem[] = [
		...sections.map((section, index) => ({
			id: anchors[index],
			title: section.title,
		})),
		...(hasPricingSection ? [{ id: "pricing", title: "Pricing" }] : []),
		...(faqs.length > 0 ? [{ id: "faq", title: "FAQ" }] : []),
	]
	const hasToc = sections.length >= TOC_MIN_SECTIONS
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

			{/* A long page puts the section list in a 200px first column of the
			    frame, which leaves 840px for the sections at full width. A short
			    page centres that same 840px column. */}
			<div
				className={`product-frame ${
					hasToc
						? "min-[1080px]:grid min-[1080px]:grid-cols-[200px_minmax(0,1fr)] min-[1080px]:gap-16"
						: ""
				}`}
			>
				{hasToc && <ProductToc items={tocItems} />}

				<div className={hasToc ? "min-w-0" : "mx-auto max-w-[840px] min-w-0"}>
					{hasToc && <ProductTocCompact items={tocItems} />}

					<ProductGalleryProvider
						images={gallery}
						galleryLabel={name}
						priorityImageId={priorityImageId}
					>
						{sections.map((section, index) => {
							const holdsPlans = index === plansIndex && pricing != null

							return (
								<ProductSection
									key={section.id}
									id={anchors[index]}
									title={section.title}
									index={index}
									projectName={name}
									hasImages={section.images.length > 0}
									body={renderedDescriptions[index]}
									beforeBody={
										holdsPlans ? <ProductPlans pricing={pricing} /> : undefined
									}
									afterBody={holdsPlans ? storeButton : undefined}
								/>
							)
						})}
					</ProductGalleryProvider>

					{hasPricingSection && (
						<section
							id="pricing"
							aria-labelledby="pricing-title"
							className="scroll-mt-4 border-t border-(--color-border) py-14 sm:py-[72px]"
						>
							<div className="grid gap-7">
								<h2 id="pricing-title" className={PRODUCT_H2_CLASS}>
									Pricing
								</h2>
								<ProductPlans pricing={pricing} />
								{pricing.kind === "offers" &&
									pricing.offers.every(
										(offer) => offer.priceCurrency === "USD"
									) && (
										<p className="text-secondary text-sm">
											US prices. The App Store shows yours.
										</p>
									)}
								{storeButton}
							</div>
						</section>
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
