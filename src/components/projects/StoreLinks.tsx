import ProjectLinkCta from "./ProjectLinkCta"
import type { LinkCta } from "@/lib/utils/platforms"
import type { ReactNode } from "react"

/** A project link that goes to a store, with how it renders (`linkCtasFor`). */
export interface StoreLink {
	link: { id: number; url: string }
	cta: LinkCta
}

interface Props {
	/** The project's store links, in link order (`splitStoreLinks`). */
	storeLinks: readonly StoreLink[]
	/** The project's status words (`statusLabel`); null for a live app. */
	statusLabel: string | null
	/** A pill's colour; the badge keeps Apple's artwork. */
	accent: string
	/**
	 * The product page's 56px badge, and the status at the same height. The
	 * gallery's tiles keep the 40px ones.
	 */
	isLarge: boolean
	/** The row's spacing and alignment, which differ from spot to spot. */
	className: string
	/**
	 * A line under the row, shown only beside a store button: it speaks for
	 * the listing ("Logging is free, forever").
	 */
	storeNote?: string | null
	/** A link that ends the row: "See how it works", "View project". */
	trailingLink?: ReactNode | null
}

/**
 * The row a reader looks to for the download: every store button the project
 * has, or its status in their place. The product page's hero, pricing and
 * closing, and the gallery's app tiles, all use it, so they can't disagree on
 * which stores they name or on how the status reads.
 *
 * An app that isn't live keeps its store link, but `linkCtasFor` makes it a
 * bare pill, which isn't a store link: the row shows the status instead, so
 * the reader finds why there's no button. Renders nothing when the row would
 * be empty.
 */
export default function StoreLinks({
	storeLinks,
	statusLabel,
	accent,
	isLarge,
	className,
	storeNote = null,
	trailingLink = null,
}: Props) {
	const hasStoreLinks = storeLinks.length > 0

	if (!hasStoreLinks && statusLabel == null && trailingLink == null) {
		return null
	}

	return (
		<>
			<div className={className}>
				{hasStoreLinks
					? storeLinks.map(({ link, cta }) => (
							<ProjectLinkCta
								key={link.id}
								url={link.url}
								cta={cta}
								accent={accent}
								isBadgeLarge={isLarge}
							/>
						))
					: statusLabel != null && (
							<p
								className={
									isLarge ? "product-status-cta-large" : "product-status-cta"
								}
							>
								{statusLabel}
							</p>
						)}

				{trailingLink}
			</div>

			{storeNote != null && hasStoreLinks && (
				<p className="mt-3 text-sm text-(--product-band-ink2)">{storeNote}</p>
			)}
		</>
	)
}
