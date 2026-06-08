import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import PrivacyPageLayout, {
	type PrivacySectionEntry,
} from "@/components/privacy/PrivacyPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Continuum – Privacy Policy",
	description: "Privacy policy for the Continuum app.",
	path: "/privacy/continuum",
})

const sections: PrivacySectionEntry[] = [
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
		<PrivacyPageLayout
			title="Continuum – Privacy Policy"
			sections={sections}
			lastUpdated="May 30, 2026"
			contactEmail="roland+continuum@leth.ro"
		/>
	)
}
