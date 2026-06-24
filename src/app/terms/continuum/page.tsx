import Link from "next/link"
import { relatedContinuumLegalLinks } from "@/components/privacy/continuumLegalLinks"
import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Continuum – Terms of Use",
	description:
		"Terms of use for Continuum, including Continuum Pro subscription and lifetime purchase terms.",
	path: "/terms/continuum",
})

const sections: LegalSectionEntry[] = [
	{
		title: "Overview",
		content: (
			<p>
				Continuum is a Mac app for managers to keep private, provisional notes
				about the people they work with. By downloading or using Continuum, you
				agree to these terms.{" "}
				<strong>
					Because Continuum is distributed through the App Store, Apple&apos;s{" "}
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
		title: "Your licence to use Continuum",
		content: (
			<p>
				Continuum is licensed to you, not sold. You get a personal,
				non-transferable licence to use the app on the Apple devices you own or
				control, as permitted by the App Store terms. You may not resell,
				redistribute, or reverse-engineer the app except where the law allows
				it.
			</p>
		),
	},
	{
		title: "The free tier and Continuum Pro",
		content: (
			<>
				<p>
					Continuum is usable for free. The free tier includes the full
					intelligence layer on a small number of people and a starter set of
					signal and entry types.
				</p>
				<p>
					<strong>Continuum Pro</strong> removes the limits and adds the power
					tools: unlimited people, unlimited signal and entry types, events,
					teams, and advanced tuning. Pro is available two ways:
				</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>
						<strong>A subscription</strong> (offered monthly and yearly, with a
						free trial on the yearly plan), or
					</li>
					<li>
						<strong>A one-time lifetime unlock</strong> — a single purchase, not
						a subscription.
					</li>
				</ul>
				<p>
					The current prices, billing period, and any free-trial length are
					shown in the app at the point of purchase. Lapsing or cancelling Pro
					never deletes or locks data you already created — your existing
					people, notes, events, and teams stay readable.
				</p>
			</>
		),
	},
	{
		title: "Billing, renewal, and cancellation",
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
						cancel at least 24 hours before the current period ends. Your
						account is charged for renewal within 24 hours before the period
						ends.
					</li>
					<li>
						You can manage or cancel a subscription anytime in your App Store
						account settings. Cancelling stops future renewals; it doesn&apos;t
						refund the current period.
					</li>
					<li>
						If a subscription offers a free trial, any unused portion of the
						trial is forfeited when you buy the subscription.
					</li>
					<li>
						The lifetime unlock is a one-time purchase and does not renew.
					</li>
				</ul>
			</>
		),
	},
	{
		title: "Refunds",
		content: (
			<p>
				Purchases and refunds are handled by Apple, not by me. If you want a
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
		title: "Your data and responsible use",
		content: (
			<p>
				Continuum stores everything on your device. It isn&apos;t sent to me or
				anyone else — see the{" "}
				<Link href="/privacy/continuum">privacy policy</Link>. Because
				you&apos;re recording notes about real people, you&apos;re responsible
				for what you keep and how you use it; please read{" "}
				<Link href="/privacy/continuum/responsible-use">
					using it responsibly
				</Link>
				. You are responsible for keeping your own backups; lose your device
				without a backup and the data is gone.
			</p>
		),
	},
	{
		title: "No warranty",
		content: (
			<p>
				Continuum is provided &quot;as is,&quot; without warranties of any kind,
				to the fullest extent the law allows. It&apos;s a tool to support your
				judgment, not a system of record or a basis for employment decisions on
				its own.
			</p>
		),
	},
	{
		title: "Limitation of liability",
		content: (
			<p>
				To the fullest extent permitted by law, I&apos;m not liable for any
				indirect, incidental, or consequential damages arising from your use of
				Continuum, including any loss of data. Nothing in these terms limits
				rights you have under mandatory consumer law.
			</p>
		),
	},
	{
		title: "Changes to these terms",
		content: (
			<p>
				These terms may change over time. Continued use after a change means you
				accept the updated terms — be sure to consult the last-update date
				below.
			</p>
		),
	},
]

export default function ContinuumTermsPage() {
	return (
		<LegalPageLayout
			title="Continuum – Terms of Use"
			sections={sections}
			lastUpdated="June 24, 2026"
			contactEmail="roland+continuum@leth.ro"
			documentKind="terms"
			relatedLinks={relatedContinuumLegalLinks("/terms/continuum")}
		/>
	)
}
