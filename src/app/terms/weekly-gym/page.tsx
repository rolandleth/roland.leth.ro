import Link from "next/link"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { relatedWeeklyGymLegalLinks } from "@/components/privacy/weeklyGymLegalLinks"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { LegalPagePath } from "@/lib/content/legalPages"
import type { Metadata } from "next"

const PAGE_PATH: LegalPagePath = "/terms/weekly-gym"

export const metadata: Metadata = buildPageMetadata({
	title: "Weekly Gym – Terms of Use",
	description:
		"Terms of use for Weekly Gym, including the Weekly Gym Pro subscription and Lifetime purchase terms.",
	path: PAGE_PATH,
})

const sections: LegalSectionEntry[] = [
	{
		title: "Overview",
		content: (
			<p>
				Weekly Gym is an iPhone app for planning your strength training by the
				week and logging your sets whenever you do them. By downloading or using
				Weekly Gym, you agree to these terms.{" "}
				<strong>
					Because Weekly Gym is distributed through the App Store, Apple&apos;s{" "}
					<a
						href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
						target="_blank"
						rel="noopener noreferrer"
					>
						Licensed Application End User License Agreement
					</a>{" "}
					also applies; where it conflicts with these terms, it governs.
				</strong>
			</p>
		),
	},
	{
		title: "Your license to use Weekly Gym",
		content: (
			<p>
				Weekly Gym is licensed to you, not sold. You get a personal,
				non-transferable license to use the app on the Apple devices you own or
				control, as permitted by the App Store terms. You may not resell,
				redistribute or reverse-engineer the app except where the law allows it.
			</p>
		),
	},
	{
		title: "Health and training",
		content: (
			<>
				<p>
					Weekly Gym shares general training information. If you have an injury
					or a health condition, check with a professional before starting.
				</p>
				<p>
					What Weekly Gym shows isn&apos;t medical advice, and the app
					doesn&apos;t prescribe weights or programs: you decide what you train
					and how.
				</p>
				<p>
					The muscles listed for each built-in exercise are general information.
					We try to keep them accurate, but we can&apos;t promise they&apos;re
					free of errors. You can change the muscles of any exercise in the app.
				</p>
			</>
		),
	},
	{
		title: "Your data",
		content: (
			<p>
				Weekly Gym stores your data on your device and, when it syncs, in your
				own iCloud account. It isn&apos;t sent to us; see the{" "}
				<Link href="/privacy/weekly-gym">privacy policy</Link>. You&apos;re
				responsible for keeping your own backups: if you lose your device and
				your data is in neither a backup nor iCloud, we have no copy to restore
				it from.
			</p>
		),
	},
	{
		title: "The free app and Weekly Gym Pro",
		content: (
			<>
				<p>
					Weekly Gym is free to download, and the free app covers the whole
					week: planning, logging, the week&apos;s progress per exercise and per
					muscle, the widgets, Siri, the controls, the Action button and iCloud
					sync. In History, it shows your most recent weeks with sets logged.
				</p>
				<p>
					<strong>Weekly Gym Pro</strong> adds every week in History, the
					alternate app icons and the themes other than Original. Weekly Gym Pro
					is available two ways:
				</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>
						<strong>A subscription</strong>, monthly or yearly, or
					</li>
					<li>
						<strong>Lifetime</strong>: a one-time purchase, not a subscription.
					</li>
				</ul>
				<p>
					With Family Sharing, the people in your family group get Weekly Gym
					Pro from your subscription or your Lifetime purchase. Only the family
					member who bought it can manage or cancel it. A family member&apos;s
					Weekly Gym Pro ends when the purchase ends or is no longer shared with
					them.
				</p>
				<p>
					The current prices, the billing period and any free trial are shown in
					the app before you buy.
				</p>
				<p>
					Not buying Weekly Gym Pro, or losing it, never deletes anything: when a
					subscription ends, a purchase is refunded or your family stops sharing
					it, your older weeks stay saved and keep syncing, and the app only
					stops showing them. When Weekly Gym Pro ends, you keep the app icon
					you picked, and the theme goes back to Original. If you get Weekly Gym
					Pro again, everything shows as it was.
				</p>
			</>
		),
	},
	{
		title: "Billing, renewal and cancellation",
		content: (
			<>
				<p>
					All purchases are processed by Apple through your Apple Account, and
					Apple&apos;s payment terms apply.
				</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>
						Payment is charged to your Apple Account when you confirm the
						purchase.
					</li>
					<li>
						A subscription renews automatically for the same period unless you
						cancel it at least 24 hours before the current period ends. Your
						account is charged for the renewal within the 24 hours before the
						period ends.
					</li>
					<li>
						You can manage or cancel a subscription at any time, from Manage
						subscription in Weekly Gym&apos;s Settings or in your App Store
						account settings. Canceling stops future renewals; it doesn&apos;t
						refund the current period, and you keep Weekly Gym Pro until that
						period ends.
					</li>
					<li>
						Lifetime doesn&apos;t renew. Buying it doesn&apos;t cancel a
						subscription you already have; cancel that in Manage subscription or
						in your App Store account settings.
					</li>
					<li>
						Weekly Gym Pro belongs to your Apple Account, so it works on any
						iPhone signed in to it; Restore purchases, in Settings, asks the App
						Store again.
					</li>
				</ul>
			</>
		),
	},
	{
		title: "Refunds",
		content: (
			<p>
				Purchases and refunds are handled by Apple, not by us. If you want a
				refund, request it through Apple at{" "}
				<a
					href="https://reportaproblem.apple.com"
					target="_blank"
					rel="noopener noreferrer"
				>
					reportaproblem.apple.com
				</a>
				.
			</p>
		),
	},
	{
		title: "Limitation of liability",
		content: (
			<p>
				To the fullest extent permitted by law, we&apos;re not liable for any
				indirect, incidental or consequential damages arising from your use of
				Weekly Gym, including any loss of data. Nothing in these terms limits
				rights you have under mandatory consumer law.
			</p>
		),
	},
	{
		title: "Changes to these terms",
		content: (
			<p>
				If you keep using Weekly Gym after these terms change, you accept the
				updated terms.
			</p>
		),
	},
]

export default function WeeklyGymTermsPage() {
	return (
		<LegalPageLayout
			title="Weekly Gym – Terms of Use"
			sections={sections}
			path={PAGE_PATH}
			contactEmail="roland+weeklygym@leth.ro"
			documentKind="terms"
			relatedLinks={relatedWeeklyGymLegalLinks(PAGE_PATH)}
		/>
	)
}
