import type { LegalRelatedLink } from "@/components/privacy/LegalPageLayout"

/**
 * An app's legal links other than the current page's own — i.e. what to show
 * in that page's "Related" section. Shared by every app's legal cluster
 * (`continuumLegalLinks`, `weeklyGymLegalLinks`). Pass the page's own `path`
 * (matching an `href` in `links`) so it isn't listed as related to itself.
 */
export function relatedLegalLinks(
	links: LegalRelatedLink[],
	currentPath: string
): LegalRelatedLink[] {
	return links.filter((link) => link.href !== currentPath)
}
