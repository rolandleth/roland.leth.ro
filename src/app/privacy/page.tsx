import PageGlow from "@/components/PageGlow"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Privacy Policy",
	description: "Privacy policy for rolandleth.com.",
}

export default function PrivacyPage() {
	return (
		<main className="relative mx-auto max-w-2xl px-4 py-12">
			<PageGlow />
			<h1 className="mb-10 text-3xl font-bold">Privacy Policy</h1>

			<div className="space-y-8">
				<section>
					<h2 className="mb-3 text-xl font-semibold">Collected information</h2>
					<div className="text-secondary space-y-4 leading-relaxed">
						<p>
							I do not use technologies like web beacons or unique device
							identifiers. My hosting provider logs basic request data such as
							your browser, operating system, and device type at the
							infrastructure level.
						</p>
						<p>
							I do not collect personally identifiable information about you —
							no name, address, phone number, or email address.
						</p>
						<p>
							This site uses{" "}
							<a
								href="https://vercel.com/docs/analytics"
								className="text-accent hover:underline"
							>
								Vercel Analytics
							</a>
							, which is cookie-free and does not track individuals. It collects
							only aggregated, anonymous data such as page views and general
							geographic region.
						</p>
						<p>
							I do not knowingly contact or collect personal information from
							children under 13. If you believe I have inadvertently collected
							such information, please contact me so I can promptly obtain
							parental consent or remove the information.
						</p>
					</div>
				</section>

				<section>
					<h2 className="mb-3 text-xl font-semibold">Sharing</h2>
					<div className="text-secondary space-y-4 leading-relaxed">
						<p>
							Since I do not collect personally identifiable information, I
							never share it with other companies.
						</p>
						<p>
							I may share anonymous information with vendors and contractors
							solely to operate this site. Their use is limited to these
							purposes, subject to confidentiality agreements, and they take
							reasonable steps to safeguard the data they hold on my behalf.
						</p>
					</div>
				</section>

				<section>
					<h2 className="mb-3 text-xl font-semibold">Third parties</h2>
					<p className="text-secondary leading-relaxed">
						To operate this site, I may make anonymous information available to
						third parties in limited circumstances: (1) with your express
						consent, (2) when required by law, (3) to protect my rights or
						property, or (4) to any successor in a merger, acquisition, or sale
						of assets. Your consent will not be required in these cases, but I
						will attempt to notify you to the extent permitted by law.
					</p>
				</section>

				<section>
					<h2 className="mb-3 text-xl font-semibold">Last update</h2>
					<p className="text-secondary leading-relaxed">
						This privacy policy was last updated on Apr 7, 2026. It may change
						from time to time — be sure to consult the last update date.
					</p>
				</section>

				<section>
					<h2 className="mb-3 text-xl font-semibold">Contact</h2>
					<p className="text-secondary leading-relaxed">
						If you have any questions or concerns, please{" "}
						<a
							href="mailto:roland+hi@leth.ro"
							className="text-accent hover:underline"
						>
							contact me
						</a>
						.
					</p>
				</section>
			</div>
		</main>
	)
}
