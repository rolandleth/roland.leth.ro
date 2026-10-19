import LegalPageLayout, {
	type LegalSectionEntry,
} from "@/components/privacy/LegalPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Privacy Policy",
	description: "Privacy policy for roland.leth.ro.",
	path: "/privacy",
})

const sections: LegalSectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					We do not use technologies like web beacons or unique device
					identifiers. This site runs on{" "}
					<a href="https://vercel.com/legal/privacy-policy">Vercel</a>, whose
					infrastructure logs basic request data such as your IP address,
					browser, operating system, and device type.
				</p>
				<p>
					We do not ask you for personal details. There are no accounts, no
					comments, and no forms, so we hold no name, address, phone number, or
					email address for you. The admin login limits repeated failed attempts
					using a short code derived from the incoming IP address, and stores
					the code rather than the address.
				</p>
				<p>
					This site uses{" "}
					<a href="https://vercel.com/docs/analytics">Vercel Analytics</a>,
					which is cookie-free and does not track individuals. It collects only
					aggregated, anonymous data such as page views and general geographic
					region.
				</p>
				<p>
					We do not knowingly contact or collect personal information from
					children under 13. If you believe we have inadvertently collected such
					information, please contact us so we can promptly obtain parental
					consent or remove the information.
				</p>
			</>
		),
	},
	{
		title: "Sharing",
		content: (
			<>
				<p>
					We have no personal details about you to sell or share, and we would
					not.
				</p>
				<p>
					We may share anonymous or pseudonymous information with vendors and
					contractors solely to operate this site. Their use is limited to these
					purposes, subject to confidentiality agreements, and they take
					reasonable steps to safeguard the data they hold on our behalf.
				</p>
			</>
		),
	},
	{
		title: "Third parties",
		content: (
			<p>
				To operate this site, we may make anonymous or pseudonymous information
				available to third parties in limited circumstances: (1) with your
				express consent, (2) when required by law, (3) to protect our rights or
				property, or (4) to any successor in a merger, acquisition, or sale of
				assets. Your consent will not be required in these cases, but we will
				attempt to notify you to the extent permitted by law.
			</p>
		),
	},
]

export default function PrivacyPage() {
	return (
		<LegalPageLayout
			title="Privacy Policy"
			sections={sections}
			lastUpdated="Oct 19, 2026"
			contactEmail="roland+hi@leth.ro"
		/>
	)
}
