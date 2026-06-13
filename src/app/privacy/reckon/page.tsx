import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Reckon – Privacy Policy",
	description: "Privacy policy for the Reckon app.",
	path: "/privacy/reckon",
})

const sections: LegalSectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not collect any personally identifiable information — no name,
					address, phone number, or email address. All data you create stays on
					your device, except as described below.
				</p>
				<p>
					The decisions you log — your predictions, confidence levels, review
					dates, check-in notes, resolutions, and satisfaction scores — are
					stored on your device and synced via iCloud by default, to keep them
					in sync across your devices. This sync is handled by Apple and
					governed by <AppleLegalLink />. We have no access to this data, and it
					only leaves your device through Apple&apos;s iCloud sync.
				</p>
				<p>
					Reckon contains no analytics, telemetry, advertising, or third-party
					tracking. We have no access to your data and never receive it.
				</p>
				<p>
					If you back up your device, your Reckon data may be included in that
					backup. Device backups are handled by Apple and governed by{" "}
					<AppleLegalLink />.
				</p>
			</>
		),
	},
	{
		title: "Purchases",
		content: (
			<p>
				Reckon is a one-time purchase through the App Store. Any purchase is
				processed by Apple. We never receive or store your payment details;
				Apple&apos;s handling of that information is governed by{" "}
				<AppleLegalLink />.
			</p>
		),
	},
]

export default function ReckonPrivacyPage() {
	return (
		<LegalPageLayout
			title="Reckon – Privacy Policy"
			sections={sections}
			lastUpdated="May 30, 2026"
			contactEmail="roland+reckon@leth.ro"
		/>
	)
}
