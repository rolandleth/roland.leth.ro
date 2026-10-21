import { relatedLegalLinks } from "@/components/privacy/relatedLegalLinks"
import type { LegalRelatedLink } from "@/components/privacy/LegalPageLayout"
import type { LegalPagePath } from "@/lib/content/legalPages"

/**
 * The Weekly Gym legal pair: privacy policy and terms. The two cross-link each
 * other so a reader landing on one (e.g. from the app's Settings) can reach the
 * other. Single source of truth for the set, so a third page joins both
 * "Related" lists at once. The app links to both paths, so they're permanent.
 */
const weeklyGymLegalLinks: LegalRelatedLink[] = [
	{ label: "Privacy policy", href: "/privacy/weekly-gym" },
	{ label: "Terms of use", href: "/terms/weekly-gym" },
]

/** The Weekly Gym legal links other than `currentPath` (`relatedLegalLinks`). */
export function relatedWeeklyGymLegalLinks(
	currentPath: LegalPagePath
): LegalRelatedLink[] {
	return relatedLegalLinks(weeklyGymLegalLinks, currentPath)
}
