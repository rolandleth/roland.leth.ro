// What counts as a video on this site. Shared by the markdown renderer (which
// URL becomes a `<video>`), the admin upload control and the route that signs
// its uploads, so the three can't disagree. Pure, so it reaches the client bundle.

import {
	FTYP_MAJOR_BRAND_OFFSET,
	ftypBrandAt,
	hasFtypBox,
} from "@/lib/utils/ftyp"

/**
 * MP4 and WebM only: the two containers every current browser plays. A
 * QuickTime `.mov` is left out because playback outside Safari depends on the
 * browser and the codec inside.
 */
export const VIDEO_MIMES = ["video/mp4", "video/webm"] as const

export type VideoMime = (typeof VIDEO_MIMES)[number]

/**
 * The file extension each video type is stored under. The renderer recognizes
 * a video by the same extensions, so anything the upload stores, it plays.
 */
export const VIDEO_EXTENSIONS: Record<VideoMime, string> = {
	"video/mp4": "mp4",
	"video/webm": "webm",
}

const VIDEO_PATH = new RegExp(
	`\\.(${Object.values(VIDEO_EXTENSIONS).join("|")})$`,
	"i"
)

/**
 * Whether `url` names a video file, judged by the extension of its path. A
 * query string or fragment after the path is ignored, so `clip.mp4?v=2` and
 * `clip.mp4#t=5` both count.
 */
export function isVideoUrl(url: string): boolean {
	const [path] = url.split(/[?#]/, 1)

	return VIDEO_PATH.test(path)
}

/**
 * The largest video a post can carry, from the admin upload or the importer.
 * It protects two Hobby allowances that images share: 1 GB of Blob storage, and
 * 10 GB of Blob data transfer a month. The second is the tight one: every play
 * downloads the file, and going over takes Blob, images included, offline for
 * up to 30 days. A screen recording of a minute or two is 3 to 5 MB.
 */
export const MAX_VIDEO_UPLOAD_MIB = 20

export const MAX_VIDEO_UPLOAD_BYTES = MAX_VIDEO_UPLOAD_MIB * 1024 * 1024

/**
 * How many leading bytes `detectVideoMime` needs. An MP4's major brand ends at
 * byte 12; a WebM's `DocType` sits further into the EBML header, around byte 24
 * as the common muxers write it.
 */
export const VIDEO_SNIFF_HEADER_BYTES = 64

/**
 * The `ftyp` major brands of an MP4. An allowlist: the same box opens a
 * QuickTime movie (`qt  `), an audio-only M4A and a HEIF or AVIF image, none of
 * which is a video this site plays. A real MP4 with a brand not listed here is
 * refused, never mistyped; add the brand if that happens.
 */
const MP4_MAJOR_BRANDS = new Set([
	"isom",
	"iso2",
	"iso3",
	"iso4",
	"iso5",
	"iso6",
	"mp41",
	"mp42",
	"avc1",
	"M4V ",
	"dash",
])

/** The EBML magic number that opens both WebM and Matroska. */
const EBML_MAGIC = [0x1a, 0x45, 0xdf, 0xa3]

/**
 * The video MIME type implied by a file's leading bytes, or `null` when they
 * match neither accepted format. Judges the container only: an MP4 holding a
 * codec the browser can't decode still passes.
 */
export function detectVideoMime(bytes: Uint8Array): VideoMime | null {
	if (hasFtypBox(bytes)) {
		const majorBrand = ftypBrandAt(bytes, FTYP_MAJOR_BRAND_OFFSET)

		return MP4_MAJOR_BRANDS.has(majorBrand) ? "video/mp4" : null
	}

	if (EBML_MAGIC.every((byte, index) => bytes[index] === byte)) {
		return hasWebmDocType(bytes) ? "video/webm" : null
	}

	return null
}

/**
 * Whether an EBML header names the `webm` document type. Matroska shares the
 * magic number and names `matroska` instead, and no browser plays it by that
 * name. A `DocType` past the end of `bytes` is not seen: a refused upload,
 * never a wrong type.
 */
function hasWebmDocType(bytes: Uint8Array): boolean {
	// Capped, so a caller that passes a whole file doesn't spread millions of
	// arguments into one call.
	const header = String.fromCharCode(
		...bytes.subarray(0, VIDEO_SNIFF_HEADER_BYTES)
	)

	return header.includes("webm")
}
