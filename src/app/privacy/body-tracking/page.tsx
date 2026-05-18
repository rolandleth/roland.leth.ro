import PrivacyPageLayout, {
	type PrivacySectionEntry,
} from "@/components/privacy/PrivacyPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Body Tracking – Privacy Policy",
	description: "Privacy policy for the Body Tracking app.",
	path: "/privacy/body-tracking",
})

const LAST_UPDATED = "Apr 7, 2026"

const sections: PrivacySectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not collect any personally identifiable information. All data
					you create stays on your device, except as described below.
				</p>
				<p>
					This app accesses Apple HealthKit weight data, solely to provide its
					core functionality. This data is never shared with third parties, used
					for advertising, or transmitted outside of Apple&apos;s
					infrastructure.
				</p>
				<p>
					The HealthKit data and any data you create are synced via iCloud by
					default, to keep it in sync across your devices. This is governed by{" "}
					<a href="https://www.apple.com/legal/privacy/">
						Apple&apos;s Privacy Policy
					</a>
					. We have no access to this data and it only leaves your device
					through Apple&apos;s iCloud sync.
				</p>
			</>
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
				<a href="mailto:roland+hi@leth.ro">contact us</a>.
			</p>
		),
	},
]

export default function BodyTrackingPrivacyPage() {
	return (
		<PrivacyPageLayout
			title="Body Tracking – Privacy Policy"
			sections={sections}
		/>
	)
}
