import PrivacyPageLayout, {
	type PrivacySectionEntry,
} from "@/components/privacy/PrivacyPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Continuum – Using it responsibly",
	description:
		"How to use Continuum responsibly when recording notes about people you manage.",
	path: "/privacy/continuum/responsible-use",
})

const sections: PrivacySectionEntry[] = [
	{
		title: "Using it responsibly",
		content: (
			<>
				<p>
					Continuum keeps private notes about real people.{" "}
					<strong>
						You&apos;re responsible for what you record and how you use it.
					</strong>{" "}
					Six principles keep it fair and defensible:
				</p>
				<ol className="list-none space-y-4 pl-0">
					<li>
						<span className="mr-2 font-mono text-sm">01</span>
						<strong>Opinions, not verdicts.</strong> Beliefs are provisional.
						Record what you think, note your confidence, and revise as you learn
						more.
					</li>
					<li>
						<span className="mr-2 font-mono text-sm">02</span>
						<strong>Only what helps you manage.</strong> Leave out health,
						beliefs, politics, and personal lives. If it wouldn&apos;t belong in
						a performance conversation, it doesn&apos;t belong here.
					</li>
					<li>
						<span className="mr-2 font-mono text-sm">03</span>
						<strong>Revisit and prune.</strong> Stale or unfair reads get
						updated or removed. An old note is a liability, not a memory.
					</li>
					<li>
						<span className="mr-2 font-mono text-sm">04</span>
						<strong>Notes don&apos;t decide.</strong> Prepare with Continuum;
						decide with people. Never the sole basis for a call about
						someone&apos;s job.
					</li>
					<li>
						<span className="mr-2 font-mono text-sm">05</span>
						<strong>Know your local rules.</strong> In some places, including
						the EU and UK, people may have a legal right to read what
						you&apos;ve written about them — opinions included. Write as if they
						will.
					</li>
					<li>
						<span className="mr-2 font-mono text-sm">06</span>
						<strong>Secure the device.</strong> Use a passcode and turn on disk
						encryption (FileVault on a Mac). This data is only as protected as
						the device it lives on.
					</li>
				</ol>
				<p>
					All of it stays on this device and never reaches us or anyone else.{" "}
					<strong>
						That privacy is real, and it puts the responsibility with you.
					</strong>
				</p>
			</>
		),
	},
]

export default function ContinuumResponsibleUsePage() {
	return (
		<PrivacyPageLayout
			title="Continuum – Using it responsibly"
			sections={sections}
			lastUpdated="June 10, 2026"
			contactEmail="roland+continuum@leth.ro"
		/>
	)
}
