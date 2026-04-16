import PageGlow from "@/components/PageGlow"
import PrivacyLink from "@/components/privacy/PrivacyLink"
import PrivacySection from "@/components/privacy/PrivacySection"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Body Tracking – Privacy Policy",
	description: "Privacy policy for the Body Tracking app.",
}

const LAST_UPDATED = "Apr 07, 2026"

const sections: { title: string; content: React.ReactNode }[] = [
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
					<PrivacyLink href="https://www.apple.com/legal/privacy/">
						Apple&apos;s Privacy Policy
					</PrivacyLink>
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
				<PrivacyLink href="mailto:roland+hi@leth.ro">contact us</PrivacyLink>.
			</p>
		),
	},
]

export default function BodyTrackingPrivacyPage() {
	return (
		<main className="relative mx-auto max-w-2xl px-4 py-12">
			<PageGlow />
			<h1 className="mb-10 text-3xl font-bold">
				Body Tracking – Privacy Policy
			</h1>

			<div className="space-y-8">
				{sections.map(({ title, content }) => (
					<PrivacySection key={title} title={title}>
						{content}
					</PrivacySection>
				))}
			</div>
		</main>
	)
}
