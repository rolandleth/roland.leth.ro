import PageGlow from "@/components/PageGlow"
import PrivacySection from "@/components/privacy/PrivacySection"

export interface PrivacySectionEntry {
	title: string
	content: React.ReactNode
}

interface Props {
	title: string
	sections: PrivacySectionEntry[]
}

/**
 * Shared layout for privacy-policy pages. Both `/privacy` and
 * `/privacy/body-tracking` render the same shell — a centered `<main>`, a
 * `PageGlow`, a page title, and a list of `PrivacySection`s — with different
 * content. Consolidating here keeps the spacing/typography in one place.
 */
export default function PrivacyPageLayout({ title, sections }: Props) {
	return (
		<main className="relative mx-auto max-w-2xl px-4 py-12">
			<PageGlow />
			<h1 className="mb-10 text-3xl font-bold">{title}</h1>

			<div className="space-y-8">
				{sections.map(({ title: sectionTitle, content }) => (
					<PrivacySection key={sectionTitle} title={sectionTitle}>
						{content}
					</PrivacySection>
				))}
			</div>
		</main>
	)
}
