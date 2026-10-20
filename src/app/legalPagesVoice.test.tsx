import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { LEGAL_PAGE_LAST_UPDATED } from "@/lib/content/legalPages"
import { formatIsoDay } from "@/lib/utils/format"
import BodyTrackingPrivacyPage from "./privacy/body-tracking/page"
import ContinuumDpiaPage from "./privacy/continuum/dpia/page"
import ContinuumPrivacyPage from "./privacy/continuum/page"
import ContinuumResponsibleUsePage from "./privacy/continuum/responsible-use/page"
import DigestPrivacyPage from "./privacy/digest/page"
import PrivacyPage from "./privacy/page"
import ReckonPrivacyPage from "./privacy/reckon/page"
import WeeklyGymPrivacyPage from "./privacy/weekly-gym/page"
import ContinuumTermsPage from "./terms/continuum/page"
import DigestTermsPage from "./terms/digest/page"
import WeeklyGymTermsPage from "./terms/weekly-gym/page"
import type { LegalPagePath } from "@/lib/content/legalPages"
import type { IsoDay } from "@/lib/utils/format"
import type { ComponentType } from "react"

// Every legal page in `LEGAL_PAGE_LAST_UPDATED`, with its component. Keyed by
// that list's paths, so a page added there and not here fails to type-check;
// and `LegalPageLayout` takes a listed path, so a page can't skip the list.
const PAGES: Record<LegalPagePath, ComponentType> = {
	"/privacy": PrivacyPage,
	"/privacy/body-tracking": BodyTrackingPrivacyPage,
	"/privacy/continuum": ContinuumPrivacyPage,
	"/privacy/continuum/dpia": ContinuumDpiaPage,
	"/privacy/continuum/responsible-use": ContinuumResponsibleUsePage,
	"/privacy/digest": DigestPrivacyPage,
	"/privacy/reckon": ReckonPrivacyPage,
	"/privacy/weekly-gym": WeeklyGymPrivacyPage,
	"/terms/continuum": ContinuumTermsPage,
	"/terms/digest": DigestTermsPage,
	"/terms/weekly-gym": WeeklyGymTermsPage,
}

const LEGAL_PAGES = Object.entries(PAGES)

// The list widened to string keys, so the entries above can look their dates
// up without a cast.
const LISTED_DATES: Readonly<Record<string, IsoDay | undefined>> =
	LEGAL_PAGE_LAST_UPDATED

const FIRST_PERSON_SINGULAR = /\b(I|I'm|I've|I'd|I'll|me|my|mine|myself)\b/

describe("legal pages", () => {
	// Every legal page speaks as "we" and "us", the site's own privacy page
	// included (owner, 2026-10-19).
	it.each(LEGAL_PAGES)(
		"%s speaks as 'we', never 'I' or 'me'",
		(_path, Page) => {
			const { container } = render(<Page />)

			expect(container.textContent).not.toMatch(FIRST_PERSON_SINGULAR)
		}
	)

	// Its own date, the one the sitemap gives as `lastModified`: a page passing
	// a sibling's path would print the sibling's.
	it.each(LEGAL_PAGES)("%s prints its own listed date", (path, Page) => {
		const { container } = render(<Page />)
		const lastUpdated = LISTED_DATES[path]

		expect(lastUpdated).toBeDefined()

		const expected = formatIsoDay(lastUpdated ?? "")

		expect(expected).not.toBeNull()
		expect(container.textContent).toContain(`last updated on ${expected}.`)
	})
})
