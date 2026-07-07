// Helpers for the upload route. They live here rather than in `route.ts`
// because the App Router only permits HTTP-method handlers and route-segment
// config as exports from a `route.ts` file — any other export (these three are
// exported for unit testing) fails Next's route-type validation at build with
// "is not a valid Route export field". Keeping them in a sibling module lets the
// tests import them directly while `route.ts` stays a valid route file.

/**
 * Strips path separators and control/space characters from a filename so it
 * can be safely appended to a generated key without escaping the blob path.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[\\/\0\s]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
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
 * Returns the image MIME type implied by the file's leading bytes, or `null`
 * if the bytes don't match any of the allowed image formats. Inspected after
 * the `file.type` allowlist so a spoofed Content-Type (`image/png` claimed,
 * `text/html` payload) is rejected before reaching Blob storage.
 */
export function detectImageMime(bytes: Uint8Array): string | null {
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

	// AVIF: `ftyp` at 4-7, AVIF brand at 8-11. `avif` is the dominant major
	// brand; `avis` (image sequence) and `mif1` (HEIF-family marker also used
	// by AVIF encoders) round out the set. HEIC brands (`heic`/`heix`) are
	// deliberately excluded — they are not browser-renderable on most
	// platforms and the allowlist is `image/avif` only, not `image/heic`.
	if (
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70
	) {
		const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])

		if (brand === "avif" || brand === "avis" || brand === "mif1") {
			return "image/avif"
		}
	}

	return null
}
