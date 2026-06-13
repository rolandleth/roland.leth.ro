/**
 * Link to Apple's Privacy Policy. The per-app privacy pages reference it
 * wherever Apple handles data on the user's behalf (iCloud sync, device
 * backups, App Store purchases), so the URL and label live here once. Opens in
 * a new tab with `rel="noopener noreferrer"` — the one convention for outbound
 * legal links across these pages (the terms page's Apple links match), so a
 * reader following a reference doesn't lose the policy they were on.
 */
export default function AppleLegalLink() {
	return (
		<a
			href="https://www.apple.com/legal/privacy/"
			target="_blank"
			rel="noopener noreferrer"
		>
			Apple&apos;s Privacy Policy
		</a>
	)
}
