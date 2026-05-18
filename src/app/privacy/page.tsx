import PrivacyPageLayout, {
	type PrivacySectionEntry,
} from "@/components/privacy/PrivacyPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Privacy Policy",
	description: "Privacy policy for roland.leth.ro.",
	path: "/privacy",
})

const LAST_UPDATED = "Apr 7, 2026"

const sections: PrivacySectionEntry[] = [
	{
		title: "Collected information",
		content: (
			<>
				<p>
					I do not use technologies like web beacons or unique device
					identifiers. My hosting provider logs basic request data such as your
					browser, operating system, and device type at the infrastructure
					level.
				</p>
				<p>
					I do not collect personally identifiable information about you — no
					name, address, phone number, or email address.
				</p>
				<p>
					This site uses{" "}
					<a href="https://vercel.com/docs/analytics">Vercel Analytics</a>,
					which is cookie-free and does not track individuals. It collects only
					aggregated, anonymous data such as page views and general geographic
					region.
				</p>
				<p>
					I do not knowingly contact or collect personal information from
					children under 13. If you believe I have inadvertently collected such
					information, please contact me so I can promptly obtain parental
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
					Since I do not collect personally identifiable information, I never
					share it with other companies.
				</p>
				<p>
					I may share anonymous information with vendors and contractors solely
					to operate this site. Their use is limited to these purposes, subject
					to confidentiality agreements, and they take reasonable steps to
					safeguard the data they hold on my behalf.
				</p>
			</>
		),
	},
	{
		title: "Third parties",
		content: (
			<p>
				To operate this site, I may make anonymous information available to
				third parties in limited circumstances: (1) with your express consent,
				(2) when required by law, (3) to protect my rights or property, or (4)
				to any successor in a merger, acquisition, or sale of assets. Your
				consent will not be required in these cases, but I will attempt to
				notify you to the extent permitted by law.
			</p>
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
				<a href="mailto:roland+hi@leth.ro">contact me</a>.
			</p>
		),
	},
]

export default function PrivacyPage() {
	return <PrivacyPageLayout title="Privacy Policy" sections={sections} />
}
