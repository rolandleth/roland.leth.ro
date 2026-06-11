import PrivacyPageLayout, {
	type PrivacySectionEntry,
} from "@/components/privacy/PrivacyPageLayout"
import { buildPageMetadata } from "@/lib/content/metadata"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "Continuum – Data Protection Impact Assessment (template)",
	description:
		"A pre-filled DPIA template for using Continuum to record information about people you manage.",
	path: "/privacy/continuum/dpia",
})

const sections: PrivacySectionEntry[] = [
	{
		title: "About this template",
		content: (
			<p>
				If you use Continuum to record information about people you manage in
				the EU or UK, you or your employer are likely the data controller for
				those notes and may need a Data Protection Impact Assessment (DPIA).
				This is pre-filled with how Continuum works; you fill in the parts about
				your own use. It is a starting point, not legal advice — check with your
				organisation&apos;s data-protection lead.
			</p>
		),
	},
	{
		title: "1. What the processing is",
		content: (
			<>
				<p>
					Pre-filled: a manager records provisional, opinion-framed beliefs and
					timestamped observations about people they manage, each belief
					carrying a confidence level, with optional signals the manager tags.
					Data is stored on the manager&apos;s device. It is never shared with
					the developer or reported upward.
				</p>
				<p>You add: who you record (team size), your purpose, and how often.</p>
			</>
		),
	},
	{
		title: "2. Necessity and proportionality",
		content: (
			<ul className="list-disc space-y-2 pl-5">
				<li>
					Lawful basis: employee consent is generally not valid (the
					employer–employee power imbalance means it is not freely given). Most
					controllers rely on legitimate interests — document the interest and
					why it outweighs the impact. (You complete.)
				</li>
				<li>
					Data minimisation: confirm you record only what is needed and exclude
					special-category data (health, religion, politics, union membership,
					sexual orientation). (You confirm.)
				</li>
				<li>
					Retention: how long you keep notes and when you delete them. (You
					state.)
				</li>
				<li>
					Data-subject rights: how you would respond to an access, correction,
					or deletion request. (You describe.)
				</li>
			</ul>
		),
	},
	{
		title: "3. Risks to the people recorded",
		content: (
			<>
				<p>Rate each for likelihood and severity:</p>
				<ul className="list-disc space-y-2 pl-5">
					<li>They are unaware the notes exist (transparency).</li>
					<li>A belief is inaccurate or unfair and influences a decision.</li>
					<li>Special-category data is recorded inadvertently.</li>
					<li>The device is lost or accessed by someone else.</li>
				</ul>
			</>
		),
	},
	{
		title: "4. Measures",
		content: (
			<>
				<p>
					Continuum provides today: opinion framing, confidence and
					revisability, local-only storage, no developer access, and no
					analytics or telemetry.
				</p>
				<p>
					You should: minimise and exclude sensitive data, keep a retention
					habit, avoid sole-basis decisions, decide whether and how to be
					transparent with the people you record, and secure your device
					(passcode, disk encryption).
				</p>
			</>
		),
	},
	{
		title: "5. Outcome and sign-off",
		content: (
			<p>
				You complete: your assessment of residual risk, approval, and a review
				date.
			</p>
		),
	},
]

export default function ContinuumDpiaPage() {
	return (
		<PrivacyPageLayout
			title="Continuum – Data Protection Impact Assessment (template)"
			sections={sections}
			lastUpdated="June 8, 2026"
			contactEmail="roland+continuum@leth.ro"
		/>
	)
}
