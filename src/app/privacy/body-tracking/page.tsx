import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Body Tracking – Privacy Policy",
	description: "Privacy policy for the Body Tracking app.",
	path: "/privacy/body-tracking",
})

const sections: LegalSectionEntry[] = [
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
					<AppleLegalLink />. We have no access to this data and it only leaves
					your device through Apple&apos;s iCloud sync.
				</p>
			</>
		),
	},
]

export default function BodyTrackingPrivacyPage() {
	return (
		<LegalPageLayout
			title="Body Tracking – Privacy Policy"
			sections={sections}
			lastUpdated="Apr 7, 2026"
			contactEmail="roland+bodytracking@leth.ro"
		/>
	)
}
