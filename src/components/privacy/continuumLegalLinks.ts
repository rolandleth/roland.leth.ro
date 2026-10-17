import { relatedLegalLinks } from "@/components/privacy/relatedLegalLinks"
import type { LegalRelatedLink } from "@/components/privacy/LegalPageLayout"

/**
 * The Continuum legal cluster: privacy policy, responsible-use guide, DPIA
 * template, and terms. The four cross-link each other so a reader landing on
 * any one (e.g. from a search result) can reach the rest. Single source of
 * truth for the set, so adding a fifth page wires it into every sibling's
 * "Related" list at once.
 */
const continuumLegalLinks: LegalRelatedLink[] = [
	{ label: "Privacy policy", href: "/privacy/continuum" },
	{ label: "Using it responsibly", href: "/privacy/continuum/responsible-use" },
	{ label: "DPIA template", href: "/privacy/continuum/dpia" },
	{ label: "Terms of use", href: "/terms/continuum" },
]

/** The Continuum legal links other than `currentPath` (`relatedLegalLinks`). */
export function relatedContinuumLegalLinks(
	currentPath: string
): LegalRelatedLink[] {
	return relatedLegalLinks(continuumLegalLinks, currentPath)
}
