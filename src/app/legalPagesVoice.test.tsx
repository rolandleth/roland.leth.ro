import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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
import type { ComponentProps, ComponentType } from "react"

// The `path` each render hands `LegalPageLayout`. The layout still renders for
// real, so the voice test below reads the full page, boilerplate included.
const renderedPaths = vi.hoisted((): string[] => [])

vi.mock("@/components/privacy/LegalPageLayout", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@/components/privacy/LegalPageLayout")
		>()
	const Layout = actual.default

	return {
		...actual,
		default: (props: ComponentProps<typeof Layout>) => {
			renderedPaths.push(props.path)

			return <Layout {...props} />
		},
	}
})

// Every legal page in `LEGAL_PAGE_LAST_UPDATED`, with its component. Keyed by
// that list's paths, so a page added there and not here fails to type-check;
// and `LegalPageLayout` takes a listed path, so a page can't skip the list.
const PAGES: Record<LegalPagePath, ComponentType> = {
	"/privacy": PrivacyPage,
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

const FIRST_PERSON_SINGULAR = /\b(I|I'm|I've|I'd|I'll|me|my|mine|myself)\b/

describe("legal pages", () => {
	beforeEach(() => {
		renderedPaths.length = 0
	})

	// Every legal page speaks as "we" and "us", the site's own privacy page
	// included (owner, 2026-10-19).
	it.each(LEGAL_PAGES)(
		"%s speaks as 'we', never 'I' or 'me'",
		(_path, Page) => {
			const { container } = render(<Page />)

			expect(container.textContent).not.toMatch(FIRST_PERSON_SINGULAR)
		}
	)

	// The path picks the page's date, the one the sitemap gives as
	// `lastModified`. Checked as the prop, not the printed date: several pages
	// share a date, so a page passing a sibling's path can print the right day.
	it.each(LEGAL_PAGES)("%s passes its own path to the layout", (path, Page) => {
		render(<Page />)

		expect(renderedPaths).toEqual([path])
	})
})
