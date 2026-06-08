import PageGlow from "@/components/PageGlow"
import PrivacySection from "@/components/privacy/PrivacySection"

export interface PrivacySectionEntry {
	title: string
	content: React.ReactNode
}

interface Props {
	title: string
	sections: PrivacySectionEntry[]
	/** Date shown in the auto-rendered "Last update" section, e.g. `"May 30, 2026"`. */
	lastUpdated: string
	/** Address used in the auto-rendered "Contact" section's `mailto:` link. */
	contactEmail: string
	/**
	 * Pronoun for the contact line: `"me"` for the personal site (`/privacy`),
	 * `"us"` for per-app policies. Defaults to `"us"` so new app pages inherit
	 * the per-app voice without restating it; only the root page overrides it.
	 */
	contactPronoun?: "me" | "us"
}

/**
 * Shared layout for privacy-policy pages. Both `/privacy` and the per-app
 * pages render the same shell — a centered wrapper, a `PageGlow`, a page
 * title, and a list of `PrivacySection`s — with different content.
 * Consolidating here keeps the spacing/typography in one place. The boilerplate
 * "Last update" and "Contact" sections are identical across every page (only
 * the date, email, and contact pronoun differ), so they render here from props
 * rather than being restated in each page's `sections`. The `<main>` landmark
 * lives in `src/app/layout.tsx`; this wrapper is a plain `<div>` so the
 * document has exactly one `<main>`.
 */
export default function PrivacyPageLayout({
	title,
	sections,
	lastUpdated,
	contactEmail,
	contactPronoun = "us",
}: Props) {
	const allSections: PrivacySectionEntry[] = [
		...sections,
		{
			title: "Last update",
			content: (
				<p>
					This privacy policy was last updated on {lastUpdated}. It may change
					from time to time — be sure to consult the last update date.
				</p>
			),
		},
		{
			title: "Contact",
			content: (
				<p>
					If you have any questions or concerns, please{" "}
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
