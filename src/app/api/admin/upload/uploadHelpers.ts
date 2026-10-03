// Helpers for the upload routes: the image upload here and the video upload in
// `video/`. They live here rather than in `route.ts`
// because the App Router only permits HTTP-method handlers and route-segment
// config as exports from a `route.ts` file — any other export (these are
// exported for unit testing) fails Next's route-type validation at build with
// "is not a valid Route export field". Keeping them in a sibling module lets the
// tests import them directly while `route.ts` stays a valid route file.

import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import {
	FTYP_MAJOR_BRAND_OFFSET,
	ftypBrandAt,
	hasFtypBox,
} from "@/lib/utils/ftyp"
import { IMAGE_EXTENSIONS } from "@/lib/utils/image"
import { randomShortId } from "@/lib/utils/randomShortId"
import { VIDEO_EXTENSIONS } from "@/lib/utils/video"
import type { ImageMime } from "@/lib/utils/image"
import type { VideoMime } from "@/lib/utils/video"

/**
 * A 403 while uploads are switched off, or `null` when they are on.
 *
 * An explicit env flag rather than gating on `NODE_ENV !== "production"`, which
 * collapses dev/test/preview into one bucket and produces a misleading 403
 * message on Vercel preview deploys (where Vercel sets NODE_ENV=production
 * but uploads should still work). Read lazily so `vi.stubEnv` works.
 */
export function refuseDisabledUploads(): NextResponse | null {
	if (process.env.ALLOW_UPLOADS === "true") {
		return null
	}

	return NextResponse.json(
		{ error: "Uploads are disabled (set ALLOW_UPLOADS=true to enable)" },
		{ status: 403 }
	)
}

/**
 * Logs a Blob failure under `tag` and returns the 500 for it. The user-facing
 * message is kept distinct from the generic 500 helper so the admin UI can show
 * "Upload failed" rather than "Internal server error".
 */
export function respondUploadFailed(tag: string, error: unknown): NextResponse {
	const requestId = randomShortId()
	// eslint-disable-next-line no-console
	console.error(tag, { requestId }, error)

	return NextResponse.json(
		{ error: "Upload failed", requestId },
		{ status: 500 }
	)
}

/**
 * Strips path separators and control/space characters from a filename so it
 * can be safely appended to a generated key without escaping the blob path.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[\\/\0\s]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
}

/** The file extension every type an admin upload can have is stored under. */
const UPLOAD_EXTENSIONS: Record<ImageMime | VideoMime, string> = {
	...IMAGE_EXTENSIONS,
	...VIDEO_EXTENSIONS,
}

/**
 * The blob key for an admin upload: `<uuid>-<sanitized base name>.<extension>`
 * at the store root. The random prefix prevents collisions and guessable URLs.
 * If the base name strips entirely, the key is `<uuid>-.<extension>`; acceptable.
 *
 * The extension comes from the sniffed type, never the client's filename: the
 * blob is served with the sniffed `Content-Type`, but a downloaded copy opens by
 * its extension, and a `.html` key on verified PNG bytes would open as a page.
 * For a video the extension does one more job: it is how the markdown renderer
 * tells a video from an image (`isVideoUrl`).
 *
 * `isAdminUploadKey` in `src/lib/import/uploadPrune.ts` recognizes exactly this
 * shape, and `scripts/prune-uploads.ts` deletes the unreferenced ones. Change
 * one and the other has to follow — `uploadPrune.test.ts` feeds keys made here
 * through it, so a drift fails there first.
 */
export function adminUploadKey(
	filename: string,
	mime: ImageMime | VideoMime
): string {
	const baseName = filename.replace(/\.[^.]*$/, "")

	return `${randomUUID()}-${sanitizeFilename(baseName)}.${UPLOAD_EXTENSIONS[mime]}`
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

	if (hasFtypBox(bytes)) {
		return isAvifFtyp(bytes) ? "image/avif" : null
	}

	return null
}

const AVIF_BRANDS = new Set(["avif", "avis"])

/**
 * Whether a file that starts with an `ftyp` box (at 4-7) is an AVIF. `avif`
 * is the dominant major brand (at 8-11) and `avis` marks an image sequence.
 * HEIC brands (`heic`/`heix`) are deliberately excluded — they are not
 * browser-renderable on most platforms and the allowlist is `image/avif`
 * only, not `image/heic`.
 *
 * Any other major brand (`msf1`, `miaf`, `heic`, …) is refused even when an
 * AVIF brand is in its compatible list: no mainstream AVIF encoder writes one,
 * so it is more likely a HEIF that also claims AVIF. The route logs such a
 * refusal as a MIME mismatch with `detectedMime: null`, the same line a
 * spoofed file gets — revisit here if a real AVIF upload gets a 415.
 */
function isAvifFtyp(bytes: Uint8Array): boolean {
	const majorBrand = ftypBrandAt(bytes, FTYP_MAJOR_BRAND_OFFSET)

	if (AVIF_BRANDS.has(majorBrand)) {
		return true
	}

	// `mif1` is the generic HEIF marker: some AVIF encoders use it, but so do
	// HEIC files. Only an AVIF brand in the compatible list tells them apart;
	// without it a HEIC would be stored as an `.avif` no browser renders.
	return majorBrand === "mif1" && hasCompatibleAvifBrand(bytes)
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
		if (AVIF_BRANDS.has(ftypBrandAt(bytes, offset))) {
			return true
		}
	}

	return false
}
