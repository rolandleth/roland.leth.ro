import PrivacyPageLayout, {
	type PrivacySectionEntry,
} from "@/components/privacy/PrivacyPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Reckon – Privacy Policy",
	description: "Privacy policy for the Reckon app.",
	path: "/privacy/reckon",
})

const LAST_UPDATED = "May 30, 2026"

const sections: PrivacySectionEntry[] = [
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
					governed by{" "}
					<a href="https://www.apple.com/legal/privacy/">
						Apple&apos;s Privacy Policy
					</a>
					. We have no access to this data, and it only leaves your device
					through Apple&apos;s iCloud sync.
				</p>
				<p>
					Reckon contains no analytics, telemetry, advertising, or third-party
					tracking. We have no access to your data and never receive it.
				</p>
				<p>
					If you back up your device, your Reckon data may be included in that
					backup. Device backups are handled by Apple and governed by{" "}
					<a href="https://www.apple.com/legal/privacy/">
						Apple&apos;s Privacy Policy
					</a>
					.
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
				<a href="https://www.apple.com/legal/privacy/">
					Apple&apos;s Privacy Policy
				</a>
				.
			</p>
		),
	},
	{
		title: "Last update",
		content: (
			<p>
				This privacy policy was last updated on {LAST_UPDATED}. It may change
				from time to time — be sure to consult the last update date.
			</p>
		),
	},
	{
		title: "Contact",
		content: (
			<p>
				If you have any questions or concerns, please{" "}
				<a href="mailto:roland+reckon@leth.ro">contact us</a>.
			</p>
		),
	},
]

export default function ReckonPrivacyPage() {
	return (
		<PrivacyPageLayout title="Reckon – Privacy Policy" sections={sections} />
	)
}
