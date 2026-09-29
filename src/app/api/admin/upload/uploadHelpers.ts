// Helpers for the upload route. They live here rather than in `route.ts`
// because the App Router only permits HTTP-method handlers and route-segment
// config as exports from a `route.ts` file — any other export (these are
// exported for unit testing) fails Next's route-type validation at build with
// "is not a valid Route export field". Keeping them in a sibling module lets the
// tests import them directly while `route.ts` stays a valid route file.

import { randomUUID } from "node:crypto"

/**
 * Strips path separators and control/space characters from a filename so it
 * can be safely appended to a generated key without escaping the blob path.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[\\/\0\s]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
}

/** The file extension each image type the sniff recognizes is stored under. */
const IMAGE_EXTENSIONS = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
} as const

export type ImageMime = keyof typeof IMAGE_EXTENSIONS

/**
 * The blob key for an admin upload: `<uuid>-<sanitized base name>.<extension>`
 * at the store root. The random prefix prevents collisions and guessable URLs.
 * If the base name strips entirely, the key is `<uuid>-.<extension>`; acceptable.
 *
 * The extension comes from the sniffed type, never the client's filename: the
 * blob is served with the sniffed `Content-Type`, but a downloaded copy opens by
 * its extension, and a `.html` key on verified PNG bytes would open as a page.
 *
 * `isAdminUploadKey` in `src/lib/import/uploadPrune.ts` recognizes exactly this
 * shape, and `scripts/prune-uploads.ts` deletes the unreferenced ones. Change
 * one and the other has to follow — `uploadPrune.test.ts` feeds keys made here
 * through it, so a drift fails there first.
 */
export function adminUploadKey(filename: string, mime: ImageMime): string {
	const baseName = filename.replace(/\.[^.]*$/, "")

	return `${randomUUID()}-${sanitizeFilename(baseName)}.${IMAGE_EXTENSIONS[mime]}`
}

/**
 * Renders an arbitrary string as a single, bounded log payload — strips
 * CR / LF / TAB / NUL so attacker-controlled bytes from the multipart
 * parser's error message can't forge fake log lines beneath the real one,
 * and clamps the length so a megabyte-sized message can't blow up the log
 * line.
 */
const MAX_LOG_MESSAGE_LEN = 200

export function sanitizeLogString(value: string): string {
	const collapsed = value.replace(/[\r\n\t\0]+/g, " ")

	return collapsed.length > MAX_LOG_MESSAGE_LEN
		? `${collapsed.slice(0, MAX_LOG_MESSAGE_LEN)}…`
		: collapsed
}

/**
 * How many leading bytes the route hands `detectImageMime`. 12 cover every
 * magic number; the rest reach the `ftyp` box's compatible brands, which an
 * AVIF with the generic `mif1` major brand needs (encoders write 20-40 bytes).
 */
export const SNIFF_HEADER_BYTES = 64

/**
 * Returns the image MIME type implied by the file's leading bytes, or `null`
 * if the bytes don't match any of the allowed image formats. Inspected after
 * the `file.type` allowlist so a spoofed Content-Type (`image/png` claimed,
 * `text/html` payload) is rejected before reaching Blob storage.
 */
export function detectImageMime(bytes: Uint8Array): ImageMime | null {
	if (bytes.length < 12) return null

	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png"
	}

	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
		return "image/jpeg"
	}

	if (
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif"
	}

	// WebP: `RIFF` at 0-3, `WEBP` at 8-11 (file size in 4-7 is variable).
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp"
	}

	// AVIF: `ftyp` at 4-7, major brand at 8-11. `avif` is the dominant major
	// brand and `avis` marks an image sequence. HEIC brands (`heic`/`heix`) are
	// deliberately excluded — they are not browser-renderable on most
	// platforms and the allowlist is `image/avif` only, not `image/heic`.
	if (
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70
	) {
		const majorBrand = brandAt(bytes, 8)

		if (AVIF_BRANDS.has(majorBrand)) {
			return "image/avif"
		}

		// `mif1` is the generic HEIF marker: some AVIF encoders use it, but so do
		// HEIC files. Only an AVIF brand in the compatible list tells them apart;
		// without it a HEIC would be stored as an `.avif` no browser renders.
		if (majorBrand === "mif1" && hasCompatibleAvifBrand(bytes)) {
			return "image/avif"
		}
	}

	return null
}

const AVIF_BRANDS = new Set(["avif", "avis"])

/** The four-character brand code at `offset`. */
function brandAt(bytes: Uint8Array, offset: number): string {
	return String.fromCharCode(
		bytes[offset],
		bytes[offset + 1],
		bytes[offset + 2],
		bytes[offset + 3]
	)
}

/**
 * Whether the `ftyp` box's compatible-brands list (from byte 16 to the box's
 * declared size) names an AVIF brand. Brands past the end of `bytes` are not
 * seen, so a box longer than `SNIFF_HEADER_BYTES` can yield a false `false`:
 * a refused upload, never a wrong type.
 */
function hasCompatibleAvifBrand(bytes: Uint8Array): boolean {
	const boxSize = new DataView(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength
	).getUint32(0)
	const end = Math.min(boxSize, bytes.length)

	for (let offset = 16; offset + 4 <= end; offset += 4) {
		if (AVIF_BRANDS.has(brandAt(bytes, offset))) {
			return true
		}
	}

	return false
}
