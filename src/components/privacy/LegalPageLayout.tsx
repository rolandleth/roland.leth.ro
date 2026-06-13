import Link from "next/link"
import PageGlow from "@/components/PageGlow"
import PrivacySection from "@/components/privacy/PrivacySection"

export interface LegalSectionEntry {
	title: string
	content: React.ReactNode
}

/** A cross-link to a sibling legal page, listed in the "Related" section. */
export interface LegalRelatedLink {
	label: string
	href: string
}

/**
 * Which legal document is being rendered. Selects the boilerplate wording: a
 * privacy policy refers to itself in the singular ("This privacy policy
 * was…"), terms in the plural ("These terms were…"), and each has its own
 * contact-section intro.
 */
export type LegalDocumentKind = "privacy" | "terms"

interface Props {
	title: string
	sections: LegalSectionEntry[]
	/** Date shown in the auto-rendered "Last update" section, e.g. `"June 10, 2026"`. */
	lastUpdated: string
	/** Address used in the auto-rendered "Contact" section's `mailto:` link. */
	contactEmail: string
	/**
	 * Pronoun for the contact line: `"me"` for the personal site (`/privacy`),
	 * `"us"` for per-app policies. Defaults to `"us"` so new app pages inherit
	 * the per-app voice without restating it; only the root page overrides it.
	 */
	contactPronoun?: "me" | "us"
	/**
	 * Which legal document this is; selects the boilerplate wording. Defaults to
	 * `"privacy"` so the existing privacy pages stay one-line callers with no
	 * change.
	 */
	documentKind?: LegalDocumentKind
	/**
	 * Sibling legal pages to surface in a "Related" section above the
	 * boilerplate, so a reader landing on one page of a cluster (e.g. the
	 * Continuum privacy / terms / DPIA / responsible-use set) can reach the
	 * others. Omitted on standalone pages.
	 */
	relatedLinks?: LegalRelatedLink[]
}

/**
 * Per-document boilerplate copy. The "Last update" and "Contact" sections are
 * identical across every page of a given kind (only the date and email differ),
 * so they render from here rather than being restated in each page's
 * `sections`. The two kinds differ only in self-reference wording, which is why
 * a single `documentKind` switch covers it.
 */
const BOILERPLATE: Record<
	LegalDocumentKind,
	{ lastUpdate: (date: string) => React.ReactNode; contactIntro: string }
> = {
	privacy: {
		lastUpdate: (date) => (
			<p>
				This privacy policy was last updated on {date}. It may change from time
				to time — be sure to consult the last update date.
			</p>
		),
		contactIntro: "If you have any questions or concerns, please ",
	},
	terms: {
		lastUpdate: (date) => (
			<p>
				These terms were last updated on {date}. They may change from time to
				time — be sure to consult the last update date.
			</p>
		),
		contactIntro: "If you have any questions about these terms, please ",
	},
}

/**
 * Shared layout for legal pages — privacy policies and terms alike. Every page
 * renders the same shell — a centered wrapper, a `PageGlow`, a page title, and
 * a list of `PrivacySection`s — with different content, so the
 * spacing/typography live in one place. The trailing "Related" (optional),
 * "Last update", and "Contact" sections render from props rather than being
 * restated per page. The `<main>` landmark lives in `src/app/layout.tsx`; this
 * wrapper is a plain `<div>` so the document has exactly one `<main>`.
 */
export default function LegalPageLayout({
	title,
	sections,
	lastUpdated,
	contactEmail,
	contactPronoun = "us",
	documentKind = "privacy",
	relatedLinks,
}: Props) {
	const boilerplate = BOILERPLATE[documentKind]
	const allSections: LegalSectionEntry[] = [
		...sections,
		...(relatedLinks && relatedLinks.length > 0
			? [
					{
						title: "Related",
						content: (
							<ul className="list-disc space-y-2 pl-5">
								{relatedLinks.map((link) => (
									<li key={link.href}>
										<Link href={link.href}>{link.label}</Link>
									</li>
								))}
							</ul>
						),
					},
				]
			: []),
		{
			title: "Last update",
			content: boilerplate.lastUpdate(lastUpdated),
		},
		{
			title: "Contact",
			content: (
				<p>
					{boilerplate.contactIntro}
					<a href={`mailto:${contactEmail}`}>contact {contactPronoun}</a>.
				</p>
			),
		},
	]

	return (
		<div className="relative mx-auto max-w-2xl px-4 py-12">
			<PageGlow />
			<h1 className="mb-10 text-3xl font-bold">{title}</h1>

			<div className="space-y-8">
				{allSections.map(({ title: sectionTitle, content }) => (
					<PrivacySection key={sectionTitle} title={sectionTitle}>
						{content}
					</PrivacySection>
				))}
			</div>
		</div>
	)
}
