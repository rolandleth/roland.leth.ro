import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { LegalPagePath } from "@/lib/content/legalPages"
import type { Metadata } from "next"

const PAGE_PATH: LegalPagePath = "/privacy/reckon"

export const metadata: Metadata = buildPageMetadata({
	title: "Reckon – Privacy Policy",
	description: "Privacy policy for the Reckon app.",
	path: PAGE_PATH,
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
					What you enter in Reckon (your decisions, with their titles,
					predictions, confidence levels and review dates; your check-ins, with
					their titles, notes, sentiment and updated confidence; your
					resolutions, with what happened, whether you were right, your
					satisfaction score and your reflection; the follow-ups you answer
					later; and your categories) is stored on your device, and so are your
					settings, such as notifications and your default category. If
					you&apos;re signed in to iCloud and iCloud is on for Reckon, what you
					enter also syncs through your own iCloud account, to keep it in step
					across your devices. This sync is handled by Apple and governed by{" "}
					<AppleLegalLink />. We have no access to this data, and it only leaves
					your device through Apple&apos;s iCloud sync. Your settings don&apos;t
					sync.
				</p>
				<p>
					Reckon has no sync switch of its own: it follows each device&apos;s
					iCloud settings. If you turn iCloud off for Reckon on a device, that
					device stops syncing, and Apple&apos;s iCloud sync removes what you
					entered in Reckon from it. What was already synced stays in your
					iCloud account until you delete it (see Deleting your data, below),
					and it comes back to the device when you turn iCloud on for Reckon
					again.
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
	{
		title: "Deleting your data",
		content: (
			<>
				<p>
					Reckon has no button that deletes everything. To delete your data,
					delete Reckon from every device that has it, then delete its data from
					iCloud: in Settings, tap your name, then iCloud, then Storage, choose
					Reckon and tap Delete Data from iCloud. Do it in that order, so no
					device is left that could sync its copy back.
				</p>
				<p>
					If Reckon has never synced, because you&apos;ve never been signed in
					to iCloud or iCloud has always been off for Reckon, deleting the app
					is enough. Signing out of iCloud, or turning iCloud off for Reckon,
					leaves what already synced in your iCloud account until you delete it
					there, with the steps above.
				</p>
			</>
		),
	},
]

export default function ReckonPrivacyPage() {
	return (
		<LegalPageLayout
			title="Reckon – Privacy Policy"
			sections={sections}
			path={PAGE_PATH}
			contactEmail="roland+reckon@leth.ro"
		/>
	)
}
