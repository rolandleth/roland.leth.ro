import Link from "next/link"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { relatedWeeklyGymLegalLinks } from "@/components/privacy/weeklyGymLegalLinks"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Weekly Gym – Terms of Use",
	description: "Terms of use for the Weekly Gym app.",
	path: "/terms/weekly-gym",
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
			</>
		),
	},
	{
		title: "Your data",
		content: (
			<p>
				Weekly Gym stores your data on your device and, when iCloud sync is on,
				in your own iCloud account. It isn&apos;t sent to us; see the{" "}
				<Link href="/privacy/weekly-gym">privacy policy</Link>. You&apos;re
				responsible for keeping your own backups: if you lose your device and
				your data is in neither a backup nor iCloud, we have no copy to restore
				it from.
			</p>
		),
	},
	{
		title: "Purchases",
		content: (
			<p>
				Some features of Weekly Gym may require a purchase or a subscription in
				the future. If they do, the app shows the price, the billing period and
				any free trial before you buy. Not buying, or ending a subscription,
				never deletes data you created.
			</p>
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
						You can manage or cancel a subscription at any time in your App
						Store account settings. Canceling stops future renewals; it
						doesn&apos;t refund the current period.
					</li>
					<li>
						If a subscription offers a free trial, buying the subscription ends
						what&apos;s left of the trial.
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
			lastUpdated="Oct 15, 2026"
			contactEmail="roland+weeklygym@leth.ro"
			documentKind="terms"
			relatedLinks={relatedWeeklyGymLegalLinks("/terms/weekly-gym")}
		/>
	)
}
