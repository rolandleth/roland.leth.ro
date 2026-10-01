import AppStoreBadge from "./AppStoreBadge"
import type { LinkCta } from "@/lib/utils/platforms"

interface Props {
	url: string
	/** How the link renders; decided by `linkCtasFor`. */
	cta: LinkCta
	accent: string
}

/** Pill styling for a link that isn't the App Store badge. */
const ctaPillClass =
	"rounded-full border px-4 py-1.5 text-center text-sm font-medium transition-opacity duration-300 hover:opacity-80"

/**
 * One project link, as the Apple badge or the accent-coloured pill. Shared by
 * both project layouts (the tabbed `ProjectContent` and the own-app product
 * page) and by every spot inside them that shows a store link, so a link
 * renders the same way everywhere.
 */
export default function ProjectLinkCta({ url, cta, accent }: Props) {
	if (cta.kind === "badge") {
		// `justify-self-center`: in the hero grid the anchor would otherwise
		// stretch to the column and leave the artwork flush left.
		return (
			<AppStoreBadge
				storefront={cta.storefront}
				href={url}
				className="justify-self-center"
			/>
		)
	}

	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className={ctaPillClass}
			style={{
				color: accent,
				borderColor: `color-mix(in srgb, ${accent} 40%, transparent)`,
			}}
		>
			{cta.label}
		</a>
	)
}
