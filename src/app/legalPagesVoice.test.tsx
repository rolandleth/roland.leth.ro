import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
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
import type { ComponentType } from "react"

// Every legal page speaks as "we" and "us", the site's own privacy page
// included (owner, 2026-10-19). A new legal page joins this list.
const LEGAL_PAGES: [string, ComponentType][] = [
	["/privacy", PrivacyPage],
	["/privacy/body-tracking", BodyTrackingPrivacyPage],
	["/privacy/continuum", ContinuumPrivacyPage],
	["/privacy/continuum/dpia", ContinuumDpiaPage],
	["/privacy/continuum/responsible-use", ContinuumResponsibleUsePage],
	["/privacy/digest", DigestPrivacyPage],
	["/privacy/reckon", ReckonPrivacyPage],
	["/privacy/weekly-gym", WeeklyGymPrivacyPage],
	["/terms/continuum", ContinuumTermsPage],
	["/terms/digest", DigestTermsPage],
	["/terms/weekly-gym", WeeklyGymTermsPage],
]

const FIRST_PERSON_SINGULAR = /\b(I|I'm|I've|I'd|I'll|me|my|mine|myself)\b/

describe("legal pages", () => {
	it.each(LEGAL_PAGES)(
		"%s speaks as 'we', never 'I' or 'me'",
		(_path, Page) => {
			const { container } = render(<Page />)

			expect(container.textContent).not.toMatch(FIRST_PERSON_SINGULAR)
		}
	)

	// `LegalPageLayout` formats the page's `yyyy-MM-dd` and throws on a bad one,
	// so this also catches a page whose date doesn't parse.
	it.each(LEGAL_PAGES)(
		"%s prints its last-update date as every legal page does",
		(_path, Page) => {
			const { container } = render(<Page />)

			expect(container.textContent).toMatch(
				/last updated on [A-Z][a-z]{2} \d{1,2}, \d{4}\./
			)
		}
	)
})
