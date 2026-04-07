import PageGlow from "@/components/PageGlow"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Body Tracking – Privacy Policy",
	description: "Privacy policy for the Body Tracking app.",
}

export default function BodyTrackingPrivacyPage() {
	return (
		<main className="relative mx-auto max-w-2xl px-4 py-12">
			<PageGlow />
			<h1 className="mb-10 text-3xl font-bold">
				Body Tracking – Privacy Policy
			</h1>

			<div className="space-y-8">
				<section>
					<h2 className="mb-3 text-xl font-semibold">Collected information</h2>
					<div className="text-secondary space-y-4 leading-relaxed">
						<p>
							We do not collect any personally identifiable information. All
							data you create stays on your device, except as described below.
						</p>
						<p>
							This app accesses Apple HealthKit weight data, solely to provide
							its core functionality. This data is never shared with third
							parties, used for advertising, or transmitted outside of
							Apple&apos;s infrastructure.
						</p>
						<p>
							The HealthKit data and any data you create are synced via iCloud
							by default, to keep it in sync across your devices. This is
							governed by{" "}
							<a
								href="https://www.apple.com/legal/privacy/"
								className="text-accent hover:underline"
							>
								Apple&apos;s Privacy Policy
							</a>
							. We have no access to this data and it only leaves your device
							through Apple&apos;s iCloud sync.
						</p>
					</div>
				</section>

				<section>
					<h2 className="mb-3 text-xl font-semibold">Last update</h2>
					<p className="text-secondary leading-relaxed">
						This privacy policy was last updated on Apr 07, 2026. It may change
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
							contact us
						</a>
						.
					</p>
				</section>
			</div>
		</main>
	)
}
