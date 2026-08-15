// Shared schema.org JSON-LD primitives used by more than one page builder
// (`postJsonLd.ts`, `projectJsonLd.ts`). Kept I/O-free so the shapes stay
// unit-testable and the page components stay thin.

import { defaultOgImage } from "@/lib/content/metadata"
import { blankToNull } from "@/lib/utils/format"

// Built from a string so the U+2028/U+2029 line separators never appear as
// literals in source — they would terminate a JS regex literal otherwise.
const LINE_SEPARATORS_PATTERN = new RegExp("[\\u2028\\u2029]", "g")
const U_2028_CHAR_CODE = 0x2028

/**
 * Serializes a JSON-LD object for embedding inside `<script type="application/
 * ld+json">`. `JSON.stringify` does not escape `<`, `>`, `&`, U+2028, or
 * U+2029, so a value containing `</script>` (or just `<`/`>`) could close the
 * tag and inject HTML, and the line separators break some JSON parsers. We
 * escape those bytes as unicode escapes — JSON parsers accept the escaped form
 * unchanged, and HTML can no longer see the literal sequence. Every JSON-LD
 * `<script>` block on the site must serialize through this, never raw
 * `JSON.stringify`.
 */
export function safeJsonLdString(value: unknown): string {
	// `JSON.stringify(undefined)` returns the value `undefined` (not a string),
	// which would make the `.replace` chain throw a cryptic TypeError. A JSON-LD
	// block must serialize a concrete value — an absent block should be skipped
	// upstream (callers do, via `JsonLdScript`), so undefined here is a bug worth
	// surfacing loudly rather than emitting a broken `<script>`.
	if (value === undefined) {
		throw new TypeError(
			"safeJsonLdString received undefined; guard the block upstream and skip the <script> instead"
		)
	}

	return JSON.stringify(value)
		.replace(/</g, "\\u003c")
		.replace(/>/g, "\\u003e")
		.replace(/&/g, "\\u0026")
		.replace(LINE_SEPARATORS_PATTERN, (char) =>
			char.charCodeAt(0) === U_2028_CHAR_CODE ? "\\u2028" : "\\u2029"
		)
}

/**
 * Absolutizes a stored image path for structured data. Vercel Blob uploads
 * (`https://…`) and any externally-hosted asset are already absolute; only
 * legacy site-relative `/images/…` paths need the origin prepended. Anchored to
 * a real scheme so protocol-relative (`//host/…`) and `data:` URLs — which a
 * bare `startsWith("http")` would wrongly re-prefix into a broken URL — are left
 * untouched. Shared by the blog and project builders so both emit valid
 * absolute `image` values for Rich Results.
 */
export function absoluteImageUrl(image: string, base: string): string {
	const isAlreadyAbsolute =
		/^https?:\/\//.test(image) ||
		image.startsWith("//") ||
		image.startsWith("data:")

	return isAlreadyAbsolute ? image : `${base}${image}`
}

/**
 * The `image` value for a content entity, absolutized, falling back to the site
 * card when the page carries no asset of its own.
 *
 * Same fallback `buildPageMetadata` applies to `og:image`, and single-sourced
 * with it on purpose. The two surfaces describe one page: a guide that
 * advertised the site card to a share debugger while telling Google it had no
 * image was stating two different things about itself, and neither builder knew
 * about the other. Whatever is worth advertising as the share image is worth
 * naming as the entity's image.
 *
 * Blank strings collapse to the fallback for the same reason they do there: the
 * columns are typed `string | null`, so `""` type-checks and `??` would carry it
 * straight through into an `image` pointing at the site root.
 */
export function jsonLdImageUrl(
	image: string | null | undefined,
	base: string
): string {
	return absoluteImageUrl(blankToNull(image) ?? defaultOgImage, base)
}

/**
 * The site's single author/publisher `Person` entity. Reused across blog and
 * project structured data so a personal site isn't forced to assert a separate
 * Organization it doesn't have. `url` is the site origin — Google's
 * structured-data validator flags author entities without a `url`, and the
 * author's homepage genuinely is this site. `base` is the origin from
 * `getSiteUrl()`, passed in so the builder stays pure.
 */
export function personFor(base: string) {
	return { "@type": "Person", name: "Roland Leth", url: base } as const
}
