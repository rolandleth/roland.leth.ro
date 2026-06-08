// Pure, I/O-free core of the project-import script (`scripts/import-projects.ts`).
// Everything here is deterministic and unit-tested; the script is the thin
// imperative shell that reads files, uploads to Blob, and writes to the DB.
//
// A manifest mirrors the `projectCreateSchema` shape, except image fields
// (`icon`, `heroImage`, every `sections[].images[].url`) hold a LOCAL path
// relative to the manifest's folder. The script uploads each local image, then
// rewrites these refs to the resulting Blob URLs before validating against
// `projectCreateSchema`. Refs that are already `http(s)` URLs pass through
// untouched, so a manifest can mix freshly-staged images with already-hosted ones.

import { createSlug } from "@/lib/utils/format"

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

// Loosely typed on purpose: the manifest is untrusted JSON. Structural and
// value-level validation is delegated to `projectCreateSchema` (run by the
// script after image refs are resolved to URLs), so this type only needs to
// describe the fields the pure helpers below touch.
export type ProjectManifest = {
	name: string
	slug?: string | null
	summary?: string
	icon?: string | null
	heroImage?: string | null
	bucket?: string
	platformTags?: string[]
	role?: string | null
	accentColor?: string | null
	isFeatured?: boolean
	isDiscontinued?: boolean
	date?: string | null
	sortOrder?: number
	sections?: ManifestSection[]
	links?: ManifestLink[]
}

// Top-level folder under which every imported image is keyed, namespaced by
// slug: `projects/<slug>/<sanitized-relative-path>`. Deterministic (no random
// suffix) so re-running the import overwrites the same blob instead of leaking
// a duplicate on the 1 GB free tier.
const BLOB_KEY_PREFIX = "projects"

// A clean URL slug: lowercase alphanumeric segments joined by single hyphens.
// Matches what `createSlug` produces and what the DB's unique `slug` expects.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

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
 * Resolves the final slug: the manifest's explicit `slug` when present,
 * otherwise derived from `name` via `createSlug`. Throws on an empty name or a
 * slug that doesn't match `SLUG_PATTERN`, so a malformed slug fails before any
 * upload or DB write rather than surfacing as an opaque unique-constraint error.
 */
export function deriveSlug(name: string, slug?: string | null): string {
	const explicit = typeof slug === "string" ? slug.trim() : ""
	const candidate = explicit !== "" ? explicit : createSlug(name ?? "")

	if (candidate === "" || !SLUG_PATTERN.test(candidate)) {
		throw new Error(
			`Cannot derive a valid slug (got "${candidate}") from name "${name}" / slug "${slug ?? ""}". ` +
				`A slug must be lowercase alphanumeric segments separated by single hyphens.`
		)
	}

	return candidate
}

/**
 * Builds the deterministic Blob key for a local image path under a project's
 * namespace. Path segments are sanitised and `.`/`..`/empty segments dropped,
 * so a traversal-shaped path (`../../secret.png`) can't escape the
 * `projects/<slug>/` prefix. Throws if nothing usable remains.
 */
export function blobKeyFor(slug: string, relativePath: string): string {
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

	return `${BLOB_KEY_PREFIX}/${slug}/${segments.join("/")}`
}

/**
 * A syntactically valid `https` URL standing in for a not-yet-uploaded image,
 * used to validate the manifest against `projectCreateSchema` (which requires
 * `http(s)` URLs) WITHOUT uploading anything. Lets `--dry-run` surface schema
 * errors and lets a real run fail fast before touching Blob storage.
 */
export function syntheticBlobUrl(slug: string, relativePath: string): string {
	return `https://blob.local/${blobKeyFor(slug, relativePath)}`
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
