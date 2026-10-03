import {
	formatPrice,
	priceLabel,
	savingsPercent,
} from "@/lib/utils/productPage"
import { ProductSectionShell } from "./ProductSection"
import type { ProjectOffer } from "@/lib/db/projects"
import type { PlanWithOffers } from "@/lib/utils/productPage"
import type { ReactNode } from "react"

/**
 * What the page prices: plan cards when the project has plans, or a single
 * card listing its offers when it only has offers (an app with one price, or
 * plans not written yet).
 */
export type Pricing =
	| { kind: "plans"; plans: PlanWithOffers[] }
	| { kind: "offers"; offers: ProjectOffer[] }

interface Props {
	pricing: Pricing
}

interface PricingSectionProps {
	id: string
	title: string
	pricing: Pricing
	/** Shown under the cards; null for none. */
	note: ReactNode | null
	/** The store button that follows the plans; null without a store link. */
	storeButton: ReactNode | null
}

/**
 * Where the plans go: a `pricing` section, or the automatic "Pricing" block
 * before the FAQ when the project has none. Title, cards, note, store button.
 */
export function ProductPricingSection({
	id,
	title,
	pricing,
	note,
	storeButton,
}: PricingSectionProps) {
	return (
		<ProductSectionShell id={id} title={title}>
			<ProductPlans pricing={pricing} />
			{note}
			{storeButton}
		</ProductSectionShell>
	)
}

/**
 * The plan cards: each plan's prices on top, then what it includes. The
 * highlighted plan sits on the band colour. A subgrid lines the name, prices
 * and features up across the cards, so the dividers match even when one plan
 * has a single price and the next has three. In a row of cards the prices are
 * centred; a lone card keeps them under its name.
 */
export default function ProductPlans({ pricing }: Props) {
	if (pricing.kind === "offers") {
		return (
			<div className="product-plan max-w-md">
				<PriceList
					offers={pricing.offers}
					label={(offer) => offer.name}
					hasTiles={hasBestValue(pricing.offers)}
					isCentered={false}
					isLast
				/>
			</div>
		)
	}

	// One flag for every card, so a card without the best value still boxes its
	// prices the same way, and they stay level with the other card's.
	const hasTiles = hasBestValue(
		pricing.plans.flatMap((planWithOffers) => planWithOffers.offers)
	)
	const [singlePlan] = pricing.plans

	// One plan (a single upfront price) spans the column: name and prices on
	// the left, what's included beside them from 640px, so a lone card doesn't
	// sit small against an empty column. The left column is only as wide as the
	// name and prices need (9rem at least), which leaves the features the room
	// to run as lines rather than wrap. Stacked like the other cards below 640px.
	if (pricing.plans.length === 1) {
		return (
			<div
				className={`product-plan grid gap-5 sm:grid-cols-[minmax(9rem,max-content)_minmax(0,1fr)] sm:gap-10 ${planHighlightClass(singlePlan.plan)}`}
			>
				<div>
					<PlanName name={singlePlan.plan.name} />
					<PriceList
						offers={singlePlan.offers}
						label={priceLabel}
						hasTiles={hasTiles}
						isCentered={false}
						isLast
					/>
				</div>

				<div className="product-plan__aside">
					<PlanFeatures features={singlePlan.plan.features} />
				</div>
			</div>
		)
	}

	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{pricing.plans.map(({ plan, offers }) => (
				<div
					key={plan.name}
					className={`product-plan row-span-3 grid grid-rows-subgrid ${planHighlightClass(plan)}`}
				>
					<PlanName name={plan.name} />
					<PriceList
						offers={offers}
						label={priceLabel}
						hasTiles={hasTiles}
						isCentered
						isLast={false}
					/>
					<PlanFeatures features={plan.features} />
				</div>
			))}
		</div>
	)
}

function planHighlightClass(plan: { isHighlighted?: boolean }): string {
	return plan.isHighlighted === true ? "product-plan--highlighted" : ""
}

function hasBestValue(offers: readonly ProjectOffer[]): boolean {
	return offers.some((offer) => offer.isBestValue === true)
}

function PlanName({ name }: { name: string }) {
	return (
		<h3 className="mb-3.5 font-serif text-[26px] leading-tight font-medium tracking-[-0.01em]">
			{name}
		</h3>
	)
}

function PlanFeatures({ features }: { features: readonly string[] }) {
	return (
		<ul className="product-plan__features grid content-start gap-2 pl-[18px] text-base leading-normal">
			{features.map((feature) => (
				<li key={feature}>{feature}</li>
			))}
		</ul>
	)
}

interface PriceListProps {
	offers: readonly ProjectOffer[]
	label: (offer: ProjectOffer) => string | null
	/**
	 * Some price on the page is the best value: every price sits in a tile of
	 * the same size, and only the best value's tile shows, so all of them stay
	 * level. The tiles' own padding replaces most of the gap between prices.
	 */
	hasTiles: boolean
	isCentered: boolean
	/** The last block in its card: no divider under it. */
	isLast: boolean
}

function PriceList({
	offers,
	label,
	hasTiles,
	isCentered,
	isLast,
}: PriceListProps) {
	return (
		<ul
			role="list"
			className={`flex flex-wrap content-start gap-y-2 ${
				hasTiles ? "gap-x-2" : "gap-x-8"
			} ${isCentered ? "justify-center text-center" : ""} ${
				isLast ? "" : "product-plan__prices mb-5 pb-5"
			}`}
		>
			{offers.map((offer) => {
				const text = label(offer)
				const isBest = offer.isBestValue === true
				const saving = isBest ? savingsPercent(offer, offers) : null

				return (
					<li
						key={offer.name}
						className={`flex flex-col gap-0.5 ${isCentered ? "items-center" : ""} ${
							hasTiles ? "product-plan__price" : ""
						} ${isBest ? "product-plan__price--best" : ""}`}
					>
						{isBest && <span className="product-plan__badge">Best value</span>}
						<span className="product-plan__amount font-serif text-[32px] leading-[1.1] tracking-[-0.015em] tabular-nums">
							{formatPrice(offer.price, offer.priceCurrency)}
						</span>
						{text != null && (
							<span className="product-plan__label text-[13px]">{text}</span>
						)}
						{saving != null && (
							<span className="product-plan__saving text-[13px]">
								Save {saving}%
							</span>
						)}
						{offer.note != null && (
							<span className="product-plan__label text-[13px]">
								{offer.note}
							</span>
						)}
					</li>
				)
			})}
		</ul>
	)
}
