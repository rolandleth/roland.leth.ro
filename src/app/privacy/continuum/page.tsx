import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import { relatedContinuumLegalLinks } from "@/components/privacy/continuumLegalLinks"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Continuum – Privacy Policy",
	description: "Privacy policy for the Continuum app.",
	path: "/privacy/continuum",
})

const sections: LegalSectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not collect any personally identifiable information — no name,
					address, phone number, or email address. Everything you create in
					Continuum stays on your device.
				</p>
				<p>
					The notes you write, the people you track, and your evolving beliefs
					about them are stored locally on your device. Continuum does not sync
					this data to iCloud or to any other server, so it never leaves your
					device through the app.
				</p>
				<p>
					Continuum contains no analytics, telemetry, advertising, or
					third-party tracking. We have no access to your data and never receive
					it.
				</p>
				<p>
					If you back up your device, your Continuum data may be included in
					that backup. Device backups are handled by Apple and governed by{" "}
					<AppleLegalLink />.
				</p>
			</>
		),
	},
	{
		title: "Purchases",
		content: (
			<p>
				Continuum offers paid features through the App Store. Any purchase is
				processed by Apple. We never receive or store your payment details;
				Apple&apos;s handling of that information is governed by{" "}
				<AppleLegalLink />.
			</p>
		),
	},
]

export default function ContinuumPrivacyPage() {
	return (
		<LegalPageLayout
			title="Continuum – Privacy Policy"
			sections={sections}
			lastUpdated="June 10, 2026"
			contactEmail="roland+continuum@leth.ro"
			relatedLinks={relatedContinuumLegalLinks("/privacy/continuum")}
		/>
	)
}
