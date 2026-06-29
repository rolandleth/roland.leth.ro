import { safeJsonLdString } from "@/lib/content/jsonLd"

/**
 * The single sanctioned place the site embeds schema.org JSON-LD. It owns the
 * one `dangerouslySetInnerHTML` call the codebase is allowed to make: ESLint
 * bans that attribute everywhere except this file (see `eslint.config.mjs`), so
 * every structured-data block is forced through `safeJsonLdString` and can't
 * break out of the `<script>` tag. Renders nothing when `data` is `null` (a
 * builder that opted out, e.g. `buildFaqJsonLd` with no FAQs), so callers pass
 * an optional block straight through without their own guard.
 */
export default function JsonLdScript({ data }: { data: unknown }) {
	if (data === null || data === undefined) {
		return null
	}

	return (
		<script
			type="application/ld+json"
			dangerouslySetInnerHTML={{ __html: safeJsonLdString(data) }}
		/>
	)
}
