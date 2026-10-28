import AppleLegalLink from "@/components/privacy/AppleLegalLink"
import ICloudDeletionSteps from "@/components/privacy/ICloudDeletionSteps"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { relatedWeeklyGymLegalLinks } from "@/components/privacy/weeklyGymLegalLinks"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { LegalPagePath } from "@/lib/content/legalPages"
import type { Metadata } from "next"

const PAGE_PATH: LegalPagePath = "/privacy/weekly-gym"

export const metadata: Metadata = buildPageMetadata({
	title: "Weekly Gym – Privacy Policy",
	description: "Privacy policy for the Weekly Gym app.",
	path: PAGE_PATH,
})

const sections: LegalSectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not collect any personally identifiable information: no name,
					address, phone number or email address. Weekly Gym has no account and
					no sign-up. What you create in Weekly Gym is stored on your device and,
					while iCloud is on for Weekly Gym, in your own iCloud account, as
					described below.
				</p>
				<p>
					What you enter in Weekly Gym (your plan, with its exercises, sets,
					reps or seconds, weights, supersets, days and day names; each
					week&apos;s own copy of the plan, with the moves, swaps and day names
					you change in that week; the sets you log, with their exercise,
					values, day and time; the exercises you create, the ones you hide from
					the library included; and any changes you make to an exercise&apos;s
					muscles) is stored on your device, and so are your settings, such as
					units and theme. If you&apos;re signed in to iCloud and iCloud is on
					for Weekly Gym, all of it also syncs through your own iCloud account
					and is stored there, to keep it in step across your devices. The app
					icon you pick stays on each device, where iOS keeps it. This sync is
					handled by Apple and governed by <AppleLegalLink />. We have no access
					to any of it.
				</p>
				<p>
					Weekly Gym has no sync switch of its own: it follows each
					device&apos;s iCloud settings. If you turn iCloud off for Weekly Gym
					on a device, that device stops syncing, and Apple&apos;s iCloud sync
					removes what you entered in Weekly Gym from it. Your settings stay on
					the device. What was already synced stays in your iCloud account until
					you delete it (see Deleting your data, below), and it comes back to
					the device when you turn iCloud on for Weekly Gym again.
				</p>
				<p>
					Weekly Gym contains no analytics, telemetry, advertising or
					third-party tracking. There&apos;s no server of ours behind it. Apart
					from iCloud sync and the App Store purchases and checks for Weekly Gym
					Pro, both handled by Apple, the app makes no network requests of its
					own. We never receive your data.
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
					Weekly Gym&apos;s widgets, on the Home Screen and the Lock Screen, and
					its controls, in Control Center, on the Lock Screen and on the Action
					button, read your data on your device. A set you log from one of them
					is saved there, like one you log in the app, and reaches your other
					devices once you next open Weekly Gym on that device.
				</p>
				<p>
					Siri and the Action button run Weekly Gym&apos;s shortcuts on your
					device. What you say to Siri is processed by Apple and governed by{" "}
					<AppleLegalLink />; Weekly Gym receives only the request itself, such
					as an exercise and how many reps. To let you say an exercise&apos;s
					name to Siri, or pick it for the Action button, a control or a widget,
					Weekly Gym gives iOS the names of this week&apos;s exercises and of
					the ones you logged recently, each with its main muscles. When Weekly
					Gym logs a set for Siri, it gives Siri the reply to show and say: the
					exercise, which set it was and its values.
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
			<>
				<p>
					Weekly Gym is free to download, and Weekly Gym Pro is an optional
					purchase through the App Store: a monthly or yearly subscription, or
					Lifetime, a one-time purchase. Any purchase is processed by Apple. We never receive or store your
					payment details; Apple&apos;s handling of that information is governed
					by <AppleLegalLink />.
				</p>
				<p>
					To know whether you have Weekly Gym Pro, the app asks the App Store on
					your device and keeps the answer on that device, where the widgets
					read it too. That answer never syncs, since each device asks the App
					Store for itself, and nothing about it reaches us.
				</p>
			</>
		),
	},
	{
		title: "Deleting your data",
		content: <ICloudDeletionSteps appName="Weekly Gym" />,
	},
]

export default function WeeklyGymPrivacyPage() {
	return (
		<LegalPageLayout
			title="Weekly Gym – Privacy Policy"
			sections={sections}
			path={PAGE_PATH}
			contactEmail="roland+weeklygym@leth.ro"
			relatedLinks={relatedWeeklyGymLegalLinks(PAGE_PATH)}
		/>
	)
}
