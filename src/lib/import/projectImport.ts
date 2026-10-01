// Pure, I/O-free core of the project-import script (`scripts/import-projects.ts`).
// Everything here is deterministic and unit-tested; the script is the thin
// imperative shell that reads files, uploads to Blob, and writes to the DB.
//
// A manifest mirrors the `projectCreateSchema` shape, except image fields
// (`icon`, `cardImage`, `ogImage`, `heroImage`, every `sections[].images[].url`) hold a LOCAL path
// relative to the manifest's folder. The script uploads each local image, then
// rewrites these refs to the resulting Blob URLs before validating against
// `projectCreateSchema`. Refs that are already `http(s)` URLs pass through
// untouched, so a manifest can mix freshly-staged images with already-hosted ones.

import { createHash } from "node:crypto"
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

export type ManifestSection = {
	title: string
	description: string
	sortOrder?: number
	images?: ManifestSectionImage[]
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
// three boolean flags, which the schema leaves optional but the import requires
// (`assertRequiredFlags`); `parseManifest` returns them typed as booleans.
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
	isFeatured?: boolean
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

// The boolean flags a manifest has to set explicitly, in the order an error
// lists them.
const REQUIRED_FLAGS = ["isFeatured", "isDiscontinued", "isOwnApp"] as const

/** The flags every manifest sets explicitly, as `assertRequiredFlags` guarantees them. */
export type ProjectFlags = {
	isFeatured: boolean
	isDiscontinued: boolean
	isOwnApp: boolean
}

/**
 * Throws unless the manifest sets every flag in `REQUIRED_FLAGS` to a boolean.
 * The import replaces the row wholesale (delete, then create), so a left-out
 * flag would quietly reset whatever the admin set: a project ticked "Own app"
 * in the admin lost its App Store badge on the next import. Checked before any
 * upload, so `--dry-run` catches it too. Only the flags are required: for them
 * `false` is a real answer, so a default can't tell "not a featured project"
 * from "forgot to say", while a left-out text field is just empty.
 *
 * Private on purpose: `parseManifest` is the only way in, so the check can't be
 * skipped by reaching for the parts separately. Tested through `parseManifest`.
 */
function assertRequiredFlags(
	manifest: ProjectManifest
): asserts manifest is ProjectManifest & ProjectFlags {
	const missingFlags = REQUIRED_FLAGS.filter(
		(flag) => typeof manifest[flag] !== "boolean"
	)

	if (missingFlags.length > 0) {
		throw new Error(
			`Manifest must set ${missingFlags.join(", ")} to true or false. ` +
				`The import replaces the whole row, so a left-out flag would reset the value set in the admin.`
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
 * Parses a manifest file's text: the JSON, then `assertRequiredFlags`. The
 * import script reads every manifest through this, so the flag check runs
 * first — before the schema, any upload and the dry-run exit — and can't be
 * dropped from the script without dropping the parse with it. The flags come
 * back typed as booleans, which is what lets the write skip a `?? false`.
 *
 * A draft (`isDraftManifest`) is refused: the script skips drafts before it
 * gets here, so one reaching this point means that check went missing, and
 * importing a page its author marked as not ready is the wrong way to find out.
 */
export function parseManifest(raw: string): ProjectManifest & ProjectFlags {
	const parsed = parseManifestObject(raw)

	if (draftFlag(parsed)) {
		throw new Error(
			`The manifest is a draft ("isDraft": true). Remove the key to import it.`
		)
	}

	// Loosely typed on purpose (see `ProjectManifest`): `projectCreateSchema`
	// validates everything but the flags later.
	const manifest = parsed as ProjectManifest

	assertRequiredFlags(manifest)

	return manifest
}

/**
 * Just the three flags. The schema's parse output types them as optional, so
 * the write takes them from the checked manifest instead.
 */
export function projectFlags(manifest: ProjectFlags): ProjectFlags {
	return {
		isFeatured: manifest.isFeatured,
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
	const segments = sanitizeRelativeSegments(relativePath)
	const filename = segments[segments.length - 1]

	return keyPathFor(slug, [
		...segments.slice(0, -1),
		`${contentHash}-${filename}`,
	])
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
	return `https://blob.local/${keyPathFor(slug, sanitizeRelativeSegments(relativePath))}`
}

/**
 * Collects every distinct local image path referenced by the manifest, in
 * first-seen order (icon, hero, then each section's images). Deduped so the
 * same file referenced twice uploads once.
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

	for (const section of manifest.sections ?? []) {
		for (const image of section.images ?? []) {
			add(image.url)
		}
	}

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

	return {
		...manifest,
		icon: mapRef(manifest.icon),
		cardImage: mapRef(manifest.cardImage),
		ogImage: mapRef(manifest.ogImage),
		heroImage: mapRef(manifest.heroImage),
		sections: manifest.sections?.map((section) => ({
			...section,
			images: section.images?.map((image) => ({
				...image,
				url: isLocalImageRef(image.url) ? resolve(image.url) : image.url,
			})),
		})),
	}
}
