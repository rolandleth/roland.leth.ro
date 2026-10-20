import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { relatedWeeklyGymLegalLinks } from "@/components/privacy/weeklyGymLegalLinks"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Weekly Gym – Privacy Policy",
	description: "Privacy policy for the Weekly Gym app.",
	path: "/privacy/weekly-gym",
})

const sections: LegalSectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not collect any personally identifiable information: no name,
					address, phone number or email address. Weekly Gym has no account and
					no sign-up. All data you create stays on your device, except as
					described below.
				</p>
				<p>
					What you enter in Weekly Gym (your plan, with its exercises, sets,
					reps or seconds, weights, supersets, days and day names; the sets you log, with
					their exercise, values, day and time; the exercises you create; and
					any changes you make to an exercise&apos;s muscles) is stored on your
					device. If you&apos;re signed in to iCloud and iCloud sync is on in
					Weekly Gym&apos;s Settings, as it is by default, this data syncs
					through your own private iCloud database, to keep it in step across
					your devices. This sync is handled by Apple and governed by{" "}
					<AppleLegalLink />. We have no access to this data.
				</p>
				<p>
					If you turn iCloud sync off, that device stops syncing the next time
					Weekly Gym starts and keeps its data. What was already synced stays in
					your iCloud account until you delete it (see Deleting your data,
					below). Your preferences, such as units and theme, never sync: they
					stay on each device.
				</p>
				<p>
					Weekly Gym contains no analytics, telemetry, advertising or
					third-party tracking. There&apos;s no server of ours behind it. Apart
					from iCloud sync and a check that you&apos;re signed in to iCloud,
					both handled by Apple, the app makes no network requests of its own.
					We never receive your data.
				</p>
				<p>
					If you back up your device, your Weekly Gym data may be included in
					that backup. Device backups are handled by Apple and governed by{" "}
					<AppleLegalLink />.
				</p>
			</>
		),
	},
	{
		title: "Widgets, controls, Siri and the Action button",
		content: (
			<>
				<p>
					Weekly Gym&apos;s widgets and its controls, in Control Center, on the
					Lock Screen and on the Action button, read your data on your device. A
					set you log from one of them is saved there, like one you log in the
					app.
				</p>
				<p>
					Siri and the Action button run Weekly Gym&apos;s shortcuts on your
					device. What you say to Siri is processed by Apple and governed by{" "}
					<AppleLegalLink />; Weekly Gym receives only the request itself, such
					as an exercise and a number of reps. So you can say an exercise&apos;s
					name to Siri or pick it for the Action button, a control or a widget,
					Weekly Gym gives iOS the names of this week&apos;s exercises and of
					the ones you logged recently.
				</p>
			</>
		),
	},
	{
		title: "Permissions",
		content: (
			<p>
				Weekly Gym doesn&apos;t ask for access to Apple Health, notifications,
				your location, your contacts or your camera, and it has no export
				feature.
			</p>
		),
	},
	{
		title: "Purchases",
		content: (
			<p>
				If Weekly Gym offers purchases, they go through the App Store and are
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
					Weekly Gym has no button that deletes everything. To delete your data,
					delete Weekly Gym from every device that has it, then delete its data
					from iCloud: in Settings, tap your name, then iCloud, then Storage,
					choose Weekly Gym and tap Delete Data from iCloud. Do it in that
					order, so no device is left that could sync its copy back.
				</p>
				<p>
					If you&apos;re not signed in to iCloud, deleting the app is enough. If
					you&apos;re signed in but turned iCloud sync off, it isn&apos;t: what
					was synced before stays in iCloud until you delete it there.
				</p>
			</>
		),
	},
]

export default function WeeklyGymPrivacyPage() {
	return (
		<LegalPageLayout
			title="Weekly Gym – Privacy Policy"
			sections={sections}
			lastUpdated="2026-10-20"
			contactEmail="roland+weeklygym@leth.ro"
			relatedLinks={relatedWeeklyGymLegalLinks("/privacy/weekly-gym")}
		/>
	)
}
