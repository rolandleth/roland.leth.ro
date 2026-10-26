import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import { relatedDigestLegalLinks } from "@/components/privacy/digestLegalLinks"
import ICloudDeletionSteps from "@/components/privacy/ICloudDeletionSteps"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { LegalPagePath } from "@/lib/content/legalPages"
import type { Metadata } from "next"

const PAGE_PATH: LegalPagePath = "/privacy/digest"

export const metadata: Metadata = buildPageMetadata({
	title: "Digest – Privacy Policy",
	description: "Privacy policy for the Digest app.",
	path: PAGE_PATH,
})

const sections: LegalSectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not collect any personally identifiable information: no name,
					address, phone number or email address. Digest has no account and no
					sign-up. All data you create stays on your device, except as described
					below.
				</p>
				<p>
					What you log in Digest (meals, with their foods, drinks, amounts,
					times and notes; stools, with their consistency, whether you had to
					rush, times and notes; and your colors, templates and links) is stored
					on your device, and so are your settings, such as the log reminder and
					the fasting timer. If you&apos;re signed in to iCloud and iCloud is on
					for Digest, what you log also syncs through your own iCloud account,
					to keep it in step across your devices. Digest has no switch for this
					sync: it follows the iCloud settings on your device. If you turn
					iCloud off for Digest, iOS removes the synced data from that device
					and keeps it in iCloud, and it comes back when you turn iCloud on
					again. This sync is handled by Apple and governed by{" "}
					<AppleLegalLink />. We have no access to this data, and it only leaves
					your device through Apple&apos;s iCloud sync, through Siri and
					Shortcuts as described below, or in a file you export yourself. Your
					settings don&apos;t sync.
				</p>
				<p>
					Digest contains no analytics, telemetry, advertising or third-party
					tracking. We have no access to your data and never receive it.
				</p>
				<p>
					If you back up your device, your Digest data may be included in that
					backup. Device backups are handled by Apple and governed by{" "}
					<AppleLegalLink />.
				</p>
			</>
		),
	},
	{
		title: "Apple Health",
		content: (
			<p>
				If you allow it, Digest reads your weight from Apple Health, only to
				show it in History. It never writes to Apple Health. The weight it reads
				isn&apos;t copied into your journal, isn&apos;t synced, isn&apos;t
				included in exports, and is never shared with third parties or used for
				advertising.
			</p>
		),
	},
	{
		title: "Siri and Shortcuts",
		content: (
			<p>
				Siri, Shortcuts and the Action button run Digest&apos;s shortcuts on
				your device. What you say to Siri is processed by Apple and governed by{" "}
				<AppleLegalLink />; Digest receives only the request itself, such as a
				template&apos;s name or a stool&apos;s type. So you can say a
				template&apos;s name to Siri or pick it in Shortcuts, Digest gives iOS
				the names of your templates.
			</p>
		),
	},
	{
		title: "Notifications",
		content: (
			<p>
				The log reminder and the fasting timer&apos;s notification are both
				optional, and both are scheduled on your device. No server of ours sends
				them.
			</p>
		),
	},
	{
		title: "Exporting your data",
		content: (
			<p>
				You can export what you log as CSV or JSON from Settings. The file is
				created on your device and goes only where you choose to send it.
			</p>
		),
	},
	{
		title: "Deleting your data",
		content: <ICloudDeletionSteps appName="Digest" dataName="your journal" />,
	},
	{
		title: "Purchases",
		content: (
			<p>
				Digest is free to download, and Pro is an optional purchase through the
				App Store: a monthly or yearly subscription, or a one-time purchase. Any
				purchase is processed by Apple. We never receive or store your payment
				details; Apple&apos;s handling of that information is governed by{" "}
				<AppleLegalLink />. To know whether you have Pro, Digest asks the App
				Store on your device and keeps the answer on your device; nothing about
				it reaches us.
			</p>
		),
	},
]

export default function DigestPrivacyPage() {
	return (
		<LegalPageLayout
			title="Digest – Privacy Policy"
			sections={sections}
			path={PAGE_PATH}
			contactEmail="roland+digest@leth.ro"
			relatedLinks={relatedDigestLegalLinks(PAGE_PATH)}
		/>
	)
}
