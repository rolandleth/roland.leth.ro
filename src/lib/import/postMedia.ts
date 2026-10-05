// Pure, I/O-free core of post media. A post file can reference an image or a
// video by a path relative to itself (`![Demo](media/my-post/demo.mp4)`); the
// import script uploads each such file to Blob and stores the body with the
// Blob URL in its place, while the file keeps the relative path, so an editor's
// preview still finds it.
//
// What is local: an image-syntax destination with no scheme and no leading `/`.
// `https://…` is already hosted and `/images/…` is served from `public/`; both
// pass through untouched, as does every link, which is never media.
//
// Everything here is deterministic and unit-tested. `postMediaRun.ts` does the
// reading and the Blob calls through injected functions; the script wires in
// the real ones.

import remarkGfm from "remark-gfm"
import remarkParse from "remark-parse"
import { unified } from "unified"
import { formatBytes } from "@/lib/import/blobSync"
import { contentAddressedKey } from "@/lib/import/projectImport"
import { IMAGE_EXTENSIONS } from "@/lib/utils/image"
import {
	detectVideoMime,
	MAX_VIDEO_UPLOAD_BYTES,
	MAX_VIDEO_UPLOAD_MIB,
	VIDEO_EXTENSIONS,
	VIDEO_MIMES,
	VIDEO_SNIFF_HEADER_BYTES,
} from "@/lib/utils/video"
import type { Section } from "@/lib/db/sections"
import type { ListedBlob } from "@/lib/import/blobSync"
import type { VideoMime } from "@/lib/utils/video"
import type { Nodes } from "mdast"

/** One place in a body where a local media file is referenced. */
export type LocalMediaRef = {
	/** The file's path relative to the post file, decoded: what to read from disk. */
	path: string
	/** Where the destination, as written, starts in the body. */
	start: number
	/** Where it ends (exclusive). */
	end: number
	/** A `?query` or `#fragment` written after the path, kept on the stored URL. */
	suffix: string
}

export type LocalMediaScan =
	{ ok: true; refs: LocalMediaRef[] } | { ok: false; reason: string }

// Parse-only: the tree is read for positions, never turned back into markdown.
// Re-serializing would reformat the whole body, and the stored body has to be
// the file's body with nothing but the media URLs changed.
const parser = unified().use(remarkParse).use(remarkGfm)

/** Top-level folder under which every post's media is keyed. */
const POST_MEDIA_KEY_PREFIX = "posts"

/** `mailto:`, `https:`, `data:` and the rest: a destination that names its own host or content. */
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * What sits right before a destination in the source: `](` for an inline
 * image, `]:` for a reference definition, then optional whitespace and the `<`
 * of the angle-bracket form.
 */
const INLINE_DESTINATION_LEAD = /\]\(\s*<?$/
const DEFINITION_DESTINATION_LEAD = /\]:\s*<?$/

/**
 * How many paths a skip reason names. The reason goes to the admin's report and
 * into a server log line, so a post with fifty images must not make either one
 * a wall of paths.
 */
const SKIP_REASON_PATH_CAP = 3

/** Image files are taken by extension; `jpeg` is the one alias in common use. */
const IMAGE_FILE_EXTENSIONS: ReadonlySet<string> = new Set([
	...Object.values(IMAGE_EXTENSIONS),
	"jpeg",
])

const VIDEO_MIME_BY_EXTENSION: ReadonlyMap<string, VideoMime> = new Map(
	VIDEO_MIMES.map((mime) => [VIDEO_EXTENSIONS[mime], mime])
)

const SUPPORTED_EXTENSIONS = [
	...IMAGE_FILE_EXTENSIONS,
	...VIDEO_MIME_BY_EXTENSION.keys(),
].join(", ")

// #region Scanning a body

/**
 * Finds every local media reference in a markdown body: inline images, and the
 * definitions that reference-style images point at. Image syntax inside a code
 * block is text, not an image, and is left out.
 *
 * Fails, rather than skipping the reference, when a path can't be used: one
 * that climbs out of the post's folder, or one written with escapes so that
 * the source can't be rewritten safely. A reference silently left alone would
 * be stored as a relative URL that resolves to nothing on the site.
 */
export function scanLocalMedia(body: string): LocalMediaScan {
	const destinations = collectDestinations(parser.parse(body))
	const refs: LocalMediaRef[] = []

	for (const destination of destinations) {
		if (!isLocalMediaUrl(destination.url)) {
			continue
		}

		const source = body.slice(destination.nodeStart, destination.nodeEnd)
		const offset = locateDestination(source, destination.url, destination.lead)

		if (offset == null) {
			return {
				ok: false,
				reason: `Can't rewrite the media path "${destination.url}"; write it without escapes or entities`,
			}
		}

		const { pathPart, suffix } = splitSuffix(destination.url)
		const path = normalizePath(decodePath(pathPart))

		if (path == null) {
			return {
				ok: false,
				reason: `The media path "${destination.url}" must stay inside the post's folder`,
			}
		}

		const start = destination.nodeStart + offset

		refs.push({ path, start, end: start + destination.url.length, suffix })
	}

	return { ok: true, refs }
}

/** The distinct files `refs` name, in first-seen order: one upload each. */
export function localMediaPaths(refs: readonly LocalMediaRef[]): string[] {
	return [...new Set(refs.map((ref) => ref.path))]
}

/**
 * The body with each local reference replaced by its URL from `urlByPath`, the
 * reference's `?query` or `#fragment` kept after it. Nothing else changes.
 * Throws when a path has no URL: the caller resolves every path first.
 */
export function rewriteLocalMedia(
	body: string,
	refs: readonly LocalMediaRef[],
	urlByPath: ReadonlyMap<string, string>
): string {
	// Last reference first, so replacing one doesn't shift the offsets of the
	// ones still to do.
	const ordered = [...refs].sort((a, b) => b.start - a.start)
	let rewritten = body

	for (const ref of ordered) {
		const url = urlByPath.get(ref.path)

		if (url == null) {
			throw new Error(`No URL resolved for media path ${ref.path}`)
		}

		rewritten =
			rewritten.slice(0, ref.start) +
			url +
			ref.suffix +
			rewritten.slice(ref.end)
	}

	return rewritten
}

/**
 * Why a body can't enter through a path that takes only the markdown file (the
 * admin bulk upload), or `null` when it can. Such a path has no media files to
 * upload, so a local reference would be stored as a URL that resolves to nothing.
 */
export function localMediaSkipReason(body: string): string | null {
	const scan = scanLocalMedia(body)

	if (!scan.ok) {
		return scan.reason
	}

	if (scan.refs.length === 0) {
		return null
	}

	const paths = localMediaPaths(scan.refs)
	const named = paths.slice(0, SKIP_REASON_PATH_CAP).join(", ")
	const unnamed = paths.length - SKIP_REASON_PATH_CAP
	const more = unnamed > 0 ? `, +${unnamed} more` : ""

	return (
		`References local media (${named}${more}); ` +
		"import it with `yarn db:import-posts`, which uploads the files"
	)
}

type Destination = {
	url: string
	nodeStart: number
	nodeEnd: number
	lead: RegExp
}

/**
 * The destination of every inline image, and of every definition that at least
 * one reference-style image uses. A definition only links use is not media.
 */
function collectDestinations(root: Nodes): Destination[] {
	const inline: Destination[] = []
	const definitions = new Map<string, Destination>()
	const imageReferenceIds = new Set<string>()

	const visit = (node: Nodes): void => {
		const start = node.position?.start.offset
		const end = node.position?.end.offset

		if (node.type === "imageReference") {
			imageReferenceIds.add(node.identifier)
		} else if (start != null && end != null) {
			if (node.type === "image") {
				inline.push({
					url: node.url,
					nodeStart: start,
					nodeEnd: end,
					lead: INLINE_DESTINATION_LEAD,
				})
			} else if (node.type === "definition") {
				definitions.set(node.identifier, {
					url: node.url,
					nodeStart: start,
					nodeEnd: end,
					lead: DEFINITION_DESTINATION_LEAD,
				})
			}
		}

		if ("children" in node) {
			for (const child of node.children) {
				visit(child)
			}
		}
	}

	visit(root)

	const referenced = [...definitions]
		.filter(([identifier]) => imageReferenceIds.has(identifier))
		.map(([, destination]) => destination)

	return [...inline, ...referenced]
}

function isLocalMediaUrl(url: string): boolean {
	return (
		url !== "" &&
		!URL_SCHEME.test(url) &&
		// Covers `/images/…` (served from `public/`) and protocol-relative `//host/…`.
		!url.startsWith("/") &&
		!url.startsWith("#") &&
		!url.startsWith("?")
	)
}

/**
 * Where `url` sits in `source` as a destination, or `null` when it isn't there
 * verbatim (the source wrote it with backslash escapes or entities, which the
 * parser decoded). Searched from the end: the same text can also appear in the
 * alt text, which comes first.
 */
function locateDestination(
	source: string,
	url: string,
	lead: RegExp
): number | null {
	let index = source.lastIndexOf(url)

	while (index !== -1) {
		if (lead.test(source.slice(0, index))) {
			return index
		}

		index = index === 0 ? -1 : source.lastIndexOf(url, index - 1)
	}

	return null
}

function splitSuffix(url: string): { pathPart: string; suffix: string } {
	const suffixStart = url.search(/[?#]/)

	if (suffixStart === -1) {
		return { pathPart: url, suffix: "" }
	}

	return {
		pathPart: url.slice(0, suffixStart),
		suffix: url.slice(suffixStart),
	}
}

/** `my%20file.png` as editors write it, back to the name on disk. A malformed escape is kept as written. */
function decodePath(pathPart: string): string {
	try {
		return decodeURIComponent(pathPart)
	} catch {
		return pathPart
	}
}

/**
 * The path with `.` segments and doubled slashes dropped, so `./a.png` and
 * `a.png` are one file. `null` for a path with a `..` segment, which could leave
 * the post's folder, and for one with nothing left.
 */
function normalizePath(path: string): string | null {
	const segments = path
		.split("/")
		.filter((segment) => segment !== "" && segment !== ".")

	if (segments.length === 0 || segments.includes("..")) {
		return null
	}

	return segments.join("/")
}

// #endregion

// #region Checking a file

/**
 * Why a media file can't be uploaded, or `null` when it can.
 *
 * An image is taken by its extension: these are first-party files, as in the
 * project importer. A video is also sniffed and capped, because a video is
 * where a wrong file is likely (a QuickTime recording renamed to `.mp4` plays
 * in no browser but Safari) and where the size costs the most to serve.
 */
export function mediaFileProblem(
	relativePath: string,
	bytes: Uint8Array
): string | null {
	const extension = extensionOf(relativePath)

	if (bytes.length === 0) {
		return `${relativePath} is empty`
	}

	if (IMAGE_FILE_EXTENSIONS.has(extension)) {
		return null
	}

	const videoMime = VIDEO_MIME_BY_EXTENSION.get(extension)

	if (videoMime == null) {
		return `${relativePath} is not a supported media type (use ${SUPPORTED_EXTENSIONS})`
	}

	if (bytes.length > MAX_VIDEO_UPLOAD_BYTES) {
		return `${relativePath} is ${formatBytes(bytes.length)}; a video can be ${MAX_VIDEO_UPLOAD_MIB} MiB at most`
	}

	const sniffedMime = detectVideoMime(
		bytes.subarray(0, VIDEO_SNIFF_HEADER_BYTES)
	)

	if (sniffedMime == null) {
		return `${relativePath} is not an MP4 or WebM video (convert a .mov to MP4 first)`
	}

	if (sniffedMime !== videoMime) {
		return `${relativePath} holds ${sniffedMime} data; rename it to .${VIDEO_EXTENSIONS[sniffedMime]}`
	}

	return null
}

/** The lowercased extension, without the dot; `""` when the name has none. */
function extensionOf(relativePath: string): string {
	const filename = relativePath.slice(relativePath.lastIndexOf("/") + 1)
	const dot = filename.lastIndexOf(".")

	return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase()
}

// #endregion

// #region Blob keys

/**
 * The blob key prefix every media file of one post lives under:
 * `posts/<section>/<slug>/`. The section is part of it because a slug is only
 * unique within its section.
 */
export function postMediaPrefixFor(section: Section, slug: string): string {
	return `${postMediaSectionPrefix(section)}${slug}/`
}

/** The prefix above every post of a section, for one listing that covers a whole run. */
export function postMediaSectionPrefix(section: Section): string {
	return `${POST_MEDIA_KEY_PREFIX}/${section}/`
}

/**
 * The content-addressed key for a post's media file:
 * `posts/<section>/<slug>/[dirs/]<contentHash>-<filename>`. The filename, and
 * so the extension, is kept: the extension is how the renderer tells a video
 * from an image, and how Blob picks the `Content-Type` it serves.
 */
export function postMediaKeyFor(
	section: Section,
	slug: string,
	relativePath: string,
	contentHash: string
): string {
	return contentAddressedKey(
		postMediaPrefixFor(section, slug),
		relativePath,
		contentHash
	)
}

/**
 * The blobs under `prefix` that `body` no longer names: earlier versions of an
 * edited file, and files the post dropped. Matched by the whole URL appearing
 * in the body, so a URL the author wrote by hand counts as a reference too.
 */
export function orphanedPostMedia(
	listing: readonly ListedBlob[],
	prefix: string,
	body: string
): ListedBlob[] {
	return listing.filter(
		(blob) => blob.pathname.startsWith(prefix) && !body.includes(blob.url)
	)
}

// #endregion
