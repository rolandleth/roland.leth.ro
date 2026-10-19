import Link from "next/link"
import { relatedDigestLegalLinks } from "@/components/privacy/digestLegalLinks"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Digest – Terms of Use",
	description:
		"Terms of use for Digest, including the Digest Pro subscription and one-time purchase terms.",
	path: "/terms/digest",
})

const sections: LegalSectionEntry[] = [
	{
		title: "Overview",
		content: (
			<p>
				Digest is a food journal for iPhone and iPad. By downloading or using
				Digest, you agree to these terms.{" "}
				<strong>
					Because Digest is distributed through the App Store, Apple&apos;s{" "}
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
		title: "Your license to use Digest",
		content: (
			<p>
				Digest is licensed to you, not sold. You get a personal,
				non-transferable license to use the app on the Apple devices you own or
				control, as permitted by the App Store terms. You may not resell,
				redistribute or reverse-engineer the app except where the law allows it.
			</p>
		),
	},
	{
		title: "What Digest is",
		content: (
			<p>
				Digest is a journal, not a medical device, and nothing in it is medical
				advice. It doesn&apos;t diagnose or treat anything.
			</p>
		),
	},
	{
		title: "The free tier and Digest Pro",
		content: (
			<>
				<p>
					Digest is free to download. Logging and exporting are free, and the
					free tier shows your most recent weeks in History and in search.
				</p>
				<p>
					<strong>Digest Pro</strong> shows every week in History and in search.
					Pro is available two ways:
				</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>
						<strong>A subscription</strong>, monthly or yearly, or
					</li>
					<li>
						<strong>A one-time purchase</strong>: a single payment, not a
						subscription.
					</li>
				</ul>
				<p>
					The current prices, the billing period and any free trial are shown in
					the app before you buy. Not buying Pro, or ending a subscription,
					never deletes anything you logged: History goes back to your most
					recent weeks, and an export still includes everything.
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
						You can manage or cancel a subscription at any time in your App
						Store account settings. Canceling stops future renewals; it
						doesn&apos;t refund the current period.
					</li>
					<li>
						If a subscription offers a free trial, buying the subscription ends
						what&apos;s left of the trial.
					</li>
					<li>
						The one-time purchase doesn&apos;t renew. Buying it doesn&apos;t
						cancel a subscription you already have; cancel that in your App
						Store account settings.
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
		title: "Your data",
		content: (
			<p>
				Digest stores your data on your device and, when you&apos;re signed in
				to iCloud, in your own iCloud account. It isn&apos;t sent to us; see the{" "}
				<Link href="/privacy/digest">privacy policy</Link>. You&apos;re
				responsible for keeping your own backups: if you lose your device and
				your data is in neither a backup nor iCloud, we have no copy to restore
				it from.
			</p>
		),
	},
	{
		title: "Limitation of liability",
		content: (
			<p>
				To the fullest extent permitted by law, we&apos;re not liable for any
				indirect, incidental or consequential damages arising from your use of
				Digest, including any loss of data. Nothing in these terms limits rights
				you have under mandatory consumer law.
			</p>
		),
	},
	{
		title: "Changes to these terms",
		content: (
			<p>
				If you keep using Digest after these terms change, you accept the
				updated terms.
			</p>
		),
	},
]

export default function DigestTermsPage() {
	return (
		<LegalPageLayout
			title="Digest – Terms of Use"
			sections={sections}
			lastUpdated="Oct 19, 2026"
			contactEmail="roland+digest@leth.ro"
			documentKind="terms"
			relatedLinks={relatedDigestLegalLinks("/terms/digest")}
		/>
	)
}
