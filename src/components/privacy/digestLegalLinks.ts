import { relatedLegalLinks } from "@/components/privacy/relatedLegalLinks"
import type { LegalRelatedLink } from "@/components/privacy/LegalPageLayout"

/**
 * The Digest legal pair: privacy policy and terms. The two cross-link each
 * other so a reader landing on one (e.g. from the paywall's links) can reach
 * the other. Single source of truth for the set, so a third page joins both
 * "Related" lists at once.
 */
const digestLegalLinks: LegalRelatedLink[] = [
	{ label: "Privacy policy", href: "/privacy/digest" },
	{ label: "Terms of use", href: "/terms/digest" },
]

/** The Digest legal links other than `currentPath` (`relatedLegalLinks`). */
export function relatedDigestLegalLinks(
	currentPath: string
): LegalRelatedLink[] {
	return relatedLegalLinks(digestLegalLinks, currentPath)
}
