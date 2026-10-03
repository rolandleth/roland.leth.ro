// Pure, I/O-free core of the project-import script (`scripts/import-projects.ts`).
// Everything here is deterministic and unit-tested; the script is the thin
// imperative shell that reads files, uploads to Blob, and writes to the DB.
//
// A manifest mirrors the `projectCreateSchema` shape, except image fields
// (`icon`, `cardImage`, `ogImage`, `heroImage`, every section image and step
// image `url`) hold a LOCAL path
// relative to the manifest's folder. The script uploads each local image, then
// rewrites these refs to the resulting Blob URLs before validating against
// `projectCreateSchema`. Refs that are already `http(s)` URLs pass through
// untouched, so a manifest can mix freshly-staged images with already-hosted ones.

import { createHash } from "node:crypto"
import { ProjectPageLayout, ProjectProminence } from "@/generated/prisma/enums"
import { errorMessage } from "@/lib/utils/errorMessage"
import {
	CANONICAL_SLUG_MESSAGE,
	CANONICAL_SLUG_PATTERN,
} from "@/lib/utils/format"

/**
 * Sanitises one path segment for a blob key: collapses separators and
 * whitespace runs to a single dash, then drops anything outside
 * `[A-Za-z0-9._-]`, so a staged filename can't break out of the key path. Kept
 * local (the admin upload route has an equivalent for untrusted uploads) so the
 * importer doesn't depend on a Next route module just to clean a string.
 */
function sanitizePathSegment(segment: string): string {
	return segment.replace(/[\\/\0\s]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
}

export type ManifestSectionImage = {
	url: string
	caption?: string | null
	sortOrder?: number
}

/** A step of a `steps` section. */
export type ManifestSectionItem = {
	title: string
	description: string
	sortOrder?: number
	images?: ManifestSectionImage[]
}

export type ManifestSection = {
	kind?: string
	layout?: string
	title: string
	description?: string
	sortOrder?: number
	images?: ManifestSectionImage[]
	items?: ManifestSectionItem[]
}

/**
 * Visits every image the sections hold, in page order: each section's own
 * images, then each of its items' images. Takes the raw manifest and the parsed
 * `projectCreateSchema` data alike. The single walk behind listing, resolving
 * and keeping a project's images: a new place an image can live is added here
 * once, since a walk that missed one would leave it un-uploaded, or let the
 * post-import prune delete a blob it just uploaded.
 */
export function forEachSectionImage<Image extends { url: string }>(
	sections:
		| readonly {
				images?: readonly Image[]
				items?: readonly { images?: readonly Image[] }[]
		  }[]
		| undefined,
	visit: (image: Image) => void
): void {
	for (const section of sections ?? []) {
		for (const image of section.images ?? []) {
			visit(image)
		}

		for (const item of section.items ?? []) {
			for (const image of item.images ?? []) {
				visit(image)
			}
		}
	}
}

export type ManifestLink = {
	label: string
	url: string
	sortOrder?: number
}

export type ManifestFaq = {
	question: string
	answer: string
	sortOrder?: number
}

export type ManifestOffer = {
	name: string
	price: string
	priceCurrency: string
	billingPeriod?: string
	sortOrder?: number
}

// Loosely typed on purpose: the manifest is untrusted JSON. Structural and
// value-level validation is delegated to `projectCreateSchema` (run by the
// script after image refs are resolved to URLs), so this type only needs to
// describe the fields the pure helpers below touch. The one exception is the
// four placement fields, which the schema leaves optional but the import
// requires (`assertRequiredFields`); `parseManifest` returns them typed.
export type ProjectManifest = {
	name: string
	slug?: string | null
	summary?: string
	metaTitle?: string | null
	keywords?: string[]
	offers?: ManifestOffer[]
	applicationCategory?: string | null
	icon?: string | null
	cardImage?: string | null
	ogImage?: string | null
	heroImage?: string | null
	bucket?: string
	platformTags?: string[]
	role?: string | null
	accentColor?: string | null
	prominence?: string
	pageLayout?: string
	isDiscontinued?: boolean
	isOwnApp?: boolean
	/** Manifest-only: a draft is skipped by the import. See `isDraftManifest`. */
	isDraft?: boolean
	date?: string | null
	sortOrder?: number
	sections?: ManifestSection[]
	links?: ManifestLink[]
	faqs?: ManifestFaq[]
}

// Top-level folder under which every imported image is keyed, namespaced by
// slug: `projects/<slug>/<sanitized-relative-path>`. Deterministic (no random
// suffix) so re-running the import overwrites the same blob instead of leaking
// a duplicate on the 1 GB free tier.
const BLOB_KEY_PREFIX = "projects"

// Hex chars of SHA-256 baked into a blob key (64 bits). The dedupe contract is
// "same key ⇒ same bytes", so a collision would silently serve wrong content;
// 64 bits puts the birthday bound far beyond any realistic image count, and
// the importer's reuse path additionally asserts byte size as a backstop.
const CONTENT_HASH_LENGTH = 16

/**
 * True when `value` is a local image reference that must be uploaded — a
 * non-empty string that isn't already an absolute `http(s)` URL. `null`,
 * `undefined`, non-strings, and already-hosted URLs all return false (left
 * untouched by `resolveManifestImageRefs`).
 */
export function isLocalImageRef(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.trim().length > 0 &&
		!/^https?:\/\//i.test(value)
	)
}

/**
 * The manifest's authored slug. Required, and checked as written, never
 * trimmed or derived: a slug that fell back to `name` changed whenever the
 * manifest renamed the project, and the import then created a second project
 * next to the old one, which stayed live. Checked before any upload, since the
 * blob keys are built from it, so a bad slug fails before anything is written.
 */
export function requireManifestSlug(manifest: ProjectManifest): string {
	const { slug } = manifest

	if (typeof slug !== "string" || slug === "") {
		throw new Error(
			`Manifest for "${manifest.name}" has no slug. Add "slug": the project's URL is /projects/<slug>, and it must not change once published.`
		)
	}

	if (!CANONICAL_SLUG_PATTERN.test(slug)) {
		throw new Error(
			`Manifest for "${manifest.name}" has an invalid slug "${slug}". ${CANONICAL_SLUG_MESSAGE}.`
		)
	}

	return slug
}

/**
 * Picks the staged project folders to import: every folder when there are no
 * filters, otherwise the ones the filters name, matched exactly and
 * case-sensitively. Sorted, so the run order doesn't depend on `readdir`.
 *
 * Any filter that names no folder refuses the whole selection and returns the
 * unmatched filters instead, each once, in the order given: a typo must stop
 * the run, not import the folders that did match and exit 0.
 */
export function selectProjectFolders(
	folderNames: readonly string[],
	filters: readonly string[]
): { selected: string[] } | { missing: string[] } {
	const missing = [...new Set(filters)].filter(
		(filter) => !folderNames.includes(filter)
	)

	if (missing.length > 0) {
		return { missing }
	}

	const selected =
		filters.length > 0
			? folderNames.filter((name) => filters.includes(name))
			: [...folderNames]

	return { selected: selected.sort() }
}

// The fields that place a project, which a manifest has to set explicitly, each
// with its allowed values, in the order an error lists them.
const REQUIRED_FIELDS = [
	{ key: "prominence", values: Object.values(ProjectProminence) },
	{ key: "pageLayout", values: Object.values(ProjectPageLayout) },
	{ key: "isDiscontinued", values: [true, false] },
	{ key: "isOwnApp", values: [true, false] },
] as const

/** The placement fields every manifest sets, as `assertRequiredFields` guarantees them. */
export type RequiredProjectFields = {
	prominence: ProjectProminence
	pageLayout: ProjectPageLayout
	isDiscontinued: boolean
	isOwnApp: boolean
}

/**
 * Throws unless the manifest sets every field in `REQUIRED_FIELDS` to one of
 * its values, or still sets `isFeatured`. The import replaces the row
 * wholesale (delete, then create), so a left-out field would quietly reset
 * whatever the admin set: a project ticked "Own app" in the admin lost its App
 * Store badge on the next import. Checked before any upload, so `--dry-run`
 * catches it too. Only these are required: each has no answer that a default
 * could stand for, while a left-out text field is just empty.
 *
 * `isFeatured` became `prominence` and `pageLayout`; a manifest still setting
 * it was written for the old model, and importing it would silently drop the
 * author's choice, so it's refused with the replacement named.
 *
 * Private on purpose: `parseManifest` is the only way in, so the check can't be
 * skipped by reaching for the parts separately. Tested through `parseManifest`.
 */
function assertRequiredFields(
	manifest: ProjectManifest
): asserts manifest is ProjectManifest & RequiredProjectFields {
	if ("isFeatured" in manifest) {
		throw new Error(
			`Manifest still sets "isFeatured", which became "prominence" (high, medium or low) and "pageLayout" (product or portfolio). ` +
				`Replace it: featured own apps are high and product, other featured projects medium, the rest low.`
		)
	}

	const problems = REQUIRED_FIELDS.filter(
		({ key, values }) =>
			!(values as readonly unknown[]).includes(
				(manifest as Record<string, unknown>)[key]
			)
	).map(({ key, values }) => `${key} (${values.join(" or ")})`)

	if (problems.length > 0) {
		throw new Error(
			`Manifest must set ${problems.join(", ")}. ` +
				`The import replaces the whole row, so a left-out value would reset the one set in the admin.`
		)
	}
}

/** The manifest text as a JSON object, or a readable error when it isn't one. */
function parseManifestObject(raw: string): Record<string, unknown> {
	let parsed: unknown

	try {
		parsed = JSON.parse(raw)
	} catch (error) {
		throw new Error(`Invalid JSON: ${errorMessage(error)}`)
	}

	// `null` and arrays parse fine but would fail the flag check with a
	// `TypeError` instead of a message about the manifest.
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("The manifest must be a JSON object.")
	}

	return parsed as Record<string, unknown>
}

/**
 * Whether a manifest's text marks it a draft: `"isDraft": true`, for an app
 * staged before it's ready to publish. The import script checks this before
 * `parseManifest` and skips a draft without validating it, so a manifest still
 * missing a flag or holding a placeholder link is reported as skipped, not as
 * failed. The key is manifest-only and never reaches the database.
 *
 * Throws for text that isn't a JSON object, and for an `isDraft` that isn't a
 * boolean: `"isDraft": "yes"` must not import a page the author meant to hold.
 */
export function isDraftManifest(raw: string): boolean {
	return draftFlag(parseManifestObject(raw))
}

function draftFlag(manifest: Record<string, unknown>): boolean {
	const { isDraft } = manifest

	if (isDraft === undefined) {
		return false
	}

	if (typeof isDraft !== "boolean") {
		throw new Error(
			`"isDraft" must be true or false, or left out; it is ${JSON.stringify(isDraft)}.`
		)
	}

	return isDraft
}

/**
 * Parses a manifest file's text: the JSON, then `assertRequiredFields` and
 * `assertNoPlaceholders`. The import script reads every manifest through this,
 * so both checks run first — before the schema, any upload and the dry-run
 * exit — and can't be dropped from the script without dropping the parse with
 * it. The placement fields come back typed, which is what lets the write skip
 * a default.
 *
 * A draft (`isDraftManifest`) is refused: the script skips drafts before it
 * gets here, so one reaching this point means that check went missing, and
 * importing a page its author marked as not ready is the wrong way to find out.
 */
export function parseManifest(
	raw: string
): ProjectManifest & RequiredProjectFields {
	const parsed = parseManifestObject(raw)

	if (draftFlag(parsed)) {
		throw new Error(
			`The manifest is a draft ("isDraft": true). Remove the key to import it.`
		)
	}

	// Loosely typed on purpose (see `ProjectManifest`): `projectCreateSchema`
	// validates everything but the placement fields later.
	const manifest = parsed as ProjectManifest

	assertRequiredFields(manifest)
	assertNoPlaceholders(parsed)

	return manifest
}

// Markers the writing workflow leaves for the author: `[VERIFY: …]` on a claim
// still to check, `[ASIDE: …]` on a slot still to fill, and the to-do marker
// (the word in capitals, then a colon) on a value not known yet. None of them
// means anything to a reader, and the import would publish them as written: a
// `[VERIFY: …]` note reached Reckon's page once.
const PLACEHOLDER_PATTERN = /\[VERIFY\b|\[ASIDE\b|\bTODO:/

// How much of the text around a placeholder the error quotes.
const PLACEHOLDER_CONTEXT_CHARS = 60

/**
 * Throws, naming each field, when any text in the manifest still holds a
 * placeholder. Runs inside `parseManifest`, so a dry run reports it before any
 * upload. Drafts are skipped before this point, so a draft can hold them.
 */
function assertNoPlaceholders(manifest: Record<string, unknown>): void {
	const found = findPlaceholders(manifest, "")

	if (found.length > 0) {
		throw new Error(
			`The manifest still holds placeholders, which would be published as written:\n${found
				.map((entry) => `  ${entry}`)
				.join("\n")}`
		)
	}
}

/** Every string under `value` that holds a placeholder, as `path: …excerpt…`. */
function findPlaceholders(value: unknown, path: string): string[] {
	if (typeof value === "string") {
		const match = PLACEHOLDER_PATTERN.exec(value)

		if (match == null) {
			return []
		}

		const excerpt = value.slice(
			match.index,
			match.index + PLACEHOLDER_CONTEXT_CHARS
		)

		return [
			`${path}: ${excerpt}${excerpt.length < value.length - match.index ? "…" : ""}`,
		]
	}

	if (Array.isArray(value)) {
		return value.flatMap((item, index) =>
			findPlaceholders(item, `${path}[${index}]`)
		)
	}

	if (typeof value === "object" && value !== null) {
		return Object.entries(value).flatMap(([key, item]) =>
			findPlaceholders(item, path === "" ? key : `${path}.${key}`)
		)
	}

	return []
}

/**
 * Just the four placement fields. The schema's parse output types them as
 * optional, so the write takes them from the checked manifest instead.
 */
export function requiredProjectFields(
	manifest: RequiredProjectFields
): RequiredProjectFields {
	return {
		prominence: manifest.prominence,
		pageLayout: manifest.pageLayout,
		isDiscontinued: manifest.isDiscontinued,
		isOwnApp: manifest.isOwnApp,
	}
}

/**
 * Splits a manifest-relative image path into sanitised key segments, dropping
 * `.`/`..`/empty parts so a traversal-shaped path (`../../secret.png`) can't
 * escape the `projects/<slug>/` prefix. Throws if nothing usable remains.
 */
function sanitizeRelativeSegments(relativePath: string): string[] {
	const segments = relativePath
		.split("/")
		.map((segment) => segment.trim())
		.filter((segment) => segment !== "" && segment !== "." && segment !== "..")
		.map((segment) => sanitizePathSegment(segment))
		.filter((segment) => segment !== "" && segment !== "-")

	if (segments.length === 0) {
		throw new Error(
			`Image path "${relativePath}" has no usable segments after sanitisation.`
		)
	}

	return segments
}

/**
 * Joins a project's namespace and already-sanitised key segments into the
 * canonical key path: `projects/<slug>/<segments...>`. The single place the
 * prefix-plus-segments shape is built, shared by `blobKeyFor` and
 * `syntheticBlobUrl` so the real and synthetic constructions can't drift
 * apart.
 */
function keyPathFor(slug: string, segments: string[]): string {
	return `${BLOB_KEY_PREFIX}/${slug}/${segments.join("/")}`
}

/**
 * The content hash baked into a blob key: the first `CONTENT_HASH_LENGTH` hex
 * chars of the SHA-256 of the image bytes. Deterministic by construction —
 * same bytes always yield the same hash, so re-imports of unchanged images
 * resolve to the same key and get reused.
 */
export function contentHashFor(bytes: Uint8Array): string {
	return createHash("sha256")
		.update(bytes)
		.digest("hex")
		.slice(0, CONTENT_HASH_LENGTH)
}

/**
 * Builds the content-addressed Blob key for a local image under a project's
 * namespace: `projects/<slug>/[dirs/]<contentHash>-<filename>`. The hash is
 * baked into the key on purpose — Vercel Blob and `next/image` both cache by
 * URL with no per-URL purge, so a stable key keeps serving the OLD bytes after
 * an overwrite (or even after the blob is deleted, until the edge cache
 * expires). Keying by content means changed bytes get a brand-new URL the
 * caches have never seen (a clean miss), while identical bytes resolve to the
 * same key and are reused — so re-imports stay idempotent.
 */
export function blobKeyFor(
	slug: string,
	relativePath: string,
	contentHash: string
): string {
	return contentAddressedKey(blobPrefixFor(slug), relativePath, contentHash)
}

/**
 * The content-addressed key for a local file under any namespace:
 * `<prefix>[dirs/]<contentHash>-<filename>`, with the path sanitised the same
 * way for every caller. `prefix` ends in `/`. `blobKeyFor` is this under a
 * project's prefix; the post importer uses it under a post's.
 */
export function contentAddressedKey(
	prefix: string,
	relativePath: string,
	contentHash: string
): string {
	const segments = sanitizeRelativeSegments(relativePath)
	const filename = segments[segments.length - 1]

	return (
		prefix + [...segments.slice(0, -1), `${contentHash}-${filename}`].join("/")
	)
}

/**
 * The blob key prefix every image of a project lives under: `projects/<slug>/`.
 * Used to `list` a project's already-uploaded blobs so a re-run can reuse the
 * unchanged ones (matched by their content-addressed key).
 */
export function blobPrefixFor(slug: string): string {
	return `${BLOB_KEY_PREFIX}/${slug}/`
}

/**
 * A syntactically valid `https` URL standing in for a not-yet-uploaded image,
 * used to validate the manifest against `projectCreateSchema` (which requires
 * `http(s)` URLs) WITHOUT uploading anything. The real key is content-addressed
 * (needs the bytes); validation only needs a well-formed URL, so this uses the
 * plain sanitised path.
 */
export function syntheticBlobUrl(slug: string, relativePath: string): string {
	return placeholderBlobUrl(
		keyPathFor(slug, sanitizeRelativeSegments(relativePath))
	)
}

/**
 * A well-formed URL standing in for the blob at `key` before it is uploaded.
 * The one place the placeholder host is spelled: `syntheticBlobUrl` builds on
 * it for a manifest's validation, and the post importer for the body a dry run
 * would store. It resolves nowhere and is never written to the database.
 */
export function placeholderBlobUrl(key: string): string {
	return `https://blob.local/${key}`
}

/**
 * Collects every distinct local image path referenced by the manifest, in
 * first-seen order (icon, card, OG, hero, then the section and step images).
 * Deduped so the same file referenced twice uploads once.
 */
export function listManifestImagePaths(manifest: ProjectManifest): string[] {
	const paths: string[] = []

	const add = (value: unknown): void => {
		if (isLocalImageRef(value)) {
			paths.push(value)
		}
	}

	add(manifest.icon)
	add(manifest.cardImage)
	add(manifest.ogImage)
	add(manifest.heroImage)
	forEachSectionImage(manifest.sections, (image) => add(image.url))

	return [...new Set(paths)]
}

/**
 * Returns a deep copy of the manifest with every local image ref replaced by
 * `resolve(localPath)`. Non-local refs (`http(s)` URLs, `null`, missing) are
 * left exactly as-is. Used twice: once with `syntheticBlobUrl` for validation,
 * once with the real uploaded URLs before the DB write.
 */
export function resolveManifestImageRefs(
	manifest: ProjectManifest,
	resolve: (localPath: string) => string
): ProjectManifest {
	const mapRef = (
		value: string | null | undefined
	): string | null | undefined =>
		isLocalImageRef(value) ? resolve(value) : value

	// A deep copy, so rewriting the URLs in place leaves the caller's manifest
	// as it was; it's resolved twice, with different URLs each time.
	const sections = structuredClone(manifest.sections)

	forEachSectionImage(sections, (image) => {
		if (isLocalImageRef(image.url)) {
			image.url = resolve(image.url)
		}
	})

	return {
		...manifest,
		icon: mapRef(manifest.icon),
		cardImage: mapRef(manifest.cardImage),
		ogImage: mapRef(manifest.ogImage),
		heroImage: mapRef(manifest.heroImage),
		sections,
	}
}
