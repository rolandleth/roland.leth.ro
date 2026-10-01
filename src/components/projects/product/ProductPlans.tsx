import { formatPrice, priceLabel } from "@/lib/utils/productPage"
import type { ProjectOffer } from "@/lib/db/projects"
import type { PlanWithOffers } from "@/lib/utils/productPage"

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

/**
 * The plan cards: each plan's prices on top, then what it includes. The
 * highlighted plan sits on the band colour. A subgrid lines the name, prices
 * and features up across the cards, so the dividers match even when one plan
 * has a single price and the next has three.
 */
export default function ProductPlans({ pricing }: Props) {
	if (pricing.kind === "offers") {
		return (
			<div className="product-plan max-w-md">
				<PriceList
					offers={pricing.offers}
					label={(offer) => offer.name}
					isLast
				/>
			</div>
		)
	}

	const isSingle = pricing.plans.length === 1

	return (
		<div className={`grid gap-4 ${isSingle ? "max-w-md" : "sm:grid-cols-2"}`}>
			{pricing.plans.map(({ plan, offers }) => (
				<div
					key={plan.name}
					className={`product-plan row-span-3 grid grid-rows-subgrid ${
						plan.isHighlighted === true ? "product-plan--highlighted" : ""
					}`}
				>
					<h3 className="mb-3.5 font-serif text-[26px] leading-tight font-medium tracking-[-0.01em]">
						{plan.name}
					</h3>

					<PriceList offers={offers} label={priceLabel} isLast={false} />

					<ul className="product-plan__features grid content-start gap-2 pl-[18px] text-base leading-normal">
						{plan.features.map((feature) => (
							<li key={feature}>{feature}</li>
						))}
					</ul>
				</div>
			))}
		</div>
	)
}

interface PriceListProps {
	offers: readonly ProjectOffer[]
	label: (offer: ProjectOffer) => string | null
	/** The last block in its card: no divider under it. */
	isLast: boolean
}

function PriceList({ offers, label, isLast }: PriceListProps) {
	return (
		<ul
			role="list"
			className={`flex flex-wrap content-start gap-x-8 gap-y-2 ${
				isLast ? "" : "product-plan__prices mb-5 pb-5"
			}`}
		>
			{offers.map((offer) => {
				const text = label(offer)

				return (
					<li key={offer.name} className="flex flex-col gap-0.5">
						<span className="font-serif text-[32px] leading-[1.1] tracking-[-0.015em] tabular-nums">
							{formatPrice(offer.price, offer.priceCurrency)}
						</span>
						{text != null && (
							<span className="product-plan__label text-[13px]">{text}</span>
						)}
					</li>
				)
			})}
		</ul>
	)
}
