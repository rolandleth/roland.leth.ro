import { randomUUID } from "node:crypto"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

const MAX_UPLOAD_MIB = 10
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MIB * 1024 * 1024
const ALLOWED_UPLOAD_MIMES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/avif",
])

/**
 * Strips path separators and control/space characters from a filename so it
 * can be safely appended to a generated key without escaping the blob path.
 * Exported for unit testing.
 */
export function sanitizeFilename(name: string): string {
	return name.replace(/[\\/\0\s]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
}

/**
 * Renders an arbitrary string as a single, bounded log payload — strips
 * CR / LF / TAB / NUL so attacker-controlled bytes from the multipart
 * parser's error message can't forge fake log lines beneath the real one,
 * and clamps the length so a megabyte-sized message can't blow up the log
 * line. Exported for unit testing.
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
 * `text/html` payload) is rejected before reaching Blob storage. Exported
 * for unit testing.
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

export async function POST(request: Request): Promise<NextResponse> {
	// Explicit env flag rather than gating on `NODE_ENV !== "production"`, which
	// collapses dev/test/preview into one bucket and produces a misleading 403
	// message on Vercel preview deploys (where Vercel sets NODE_ENV=production
	// but uploads should still work). Read lazily so `vi.stubEnv` works.
	if (process.env.ALLOW_UPLOADS !== "true") {
		return NextResponse.json(
			{ error: "Uploads are disabled (set ALLOW_UPLOADS=true to enable)" },
			{ status: 403 }
		)
	}

	// `request.formData()` buffers the entire body before returning, so checking
	// `file.size` afterwards is too late to short-circuit a giant upload. The
	// `Content-Length` header is set by every well-formed multipart client and
	// gives us a cheap pre-parse rejection. Off by ~the multipart boundary
	// overhead (a few hundred bytes), but that's irrelevant against a 10 MiB cap.
	//
	// Only act on the precheck when the declared size parses as a non-negative
	// finite number. A negative or non-numeric `Content-Length` would coerce
	// past the `> MAX_UPLOAD_BYTES` guard (e.g. `Number("-1") === -1`); the
	// post-parse cap still catches the real size, but the precheck should not
	// silently wave through obviously malformed headers.
	const contentLength = request.headers.get("content-length")
	const declaredSize = contentLength === null ? null : Number(contentLength)
	const isValidDeclaredSize =
		declaredSize !== null && Number.isFinite(declaredSize) && declaredSize >= 0

	if (isValidDeclaredSize && declaredSize > MAX_UPLOAD_BYTES) {
		// Log key matches the post-parse 413 below (`size: number`) so one grep
		// covers both branches; the precheck previously logged
		// `{ contentLength: string }` and required two greps.
		// eslint-disable-next-line no-console
		console.warn("[api:upload:POST] oversize precheck", { size: declaredSize })

		return NextResponse.json(
			{ error: `File exceeds ${MAX_UPLOAD_MIB} MiB limit` },
			{ status: 413 }
		)
	}

	let formData: FormData

	try {
		formData = await request.formData()
	} catch (error) {
		// A malformed multipart body throws from `formData()`; surface a 400
		// rather than letting the rejection bubble as an uncaught exception.
		// Logged at warn so a botnet probing this endpoint with garbage bodies
		// shows up in logs alongside the other 4xx (oversize / mime / mismatch).
		//
		// The parser's error message can echo bytes from the offending
		// boundary back into the log line — including newlines, which
		// would let an attacker forge fake log lines below this one
		// ("log injection"). Strip CR/LF/NUL and clamp the length before
		// logging so the payload stays single-line and bounded.
		const rawMessage = error instanceof Error ? error.message : String(error)
		const safeMessage = sanitizeLogString(rawMessage)
		// eslint-disable-next-line no-console
		console.warn("[api:upload:POST] malformed multipart", {
			message: safeMessage,
		})

		return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
	}

	const file = formData.get("file")

	if (!(file instanceof File)) {
		return NextResponse.json({ error: "No file provided" }, { status: 400 })
	}

	if (file.size > MAX_UPLOAD_BYTES) {
		// eslint-disable-next-line no-console
		console.warn("[api:upload:POST] oversize after parse", { size: file.size })

		return NextResponse.json(
			{ error: `File exceeds ${MAX_UPLOAD_MIB} MiB limit` },
			{ status: 413 }
		)
	}

	// `file.type` is set by the client and trivially spoofable; the allowlist
	// blocks the obvious case (drag-and-drop of a `.html`) and SVG specifically
	// (XSS-shaped). Magic-byte sniff below catches the deliberate case of a
	// payload mislabelled as an allowed image type.
	if (!ALLOWED_UPLOAD_MIMES.has(file.type)) {
		// eslint-disable-next-line no-console
		console.warn("[api:upload:POST] disallowed mime", {
			claimedType: file.type,
		})

		return NextResponse.json(
			{ error: "Unsupported file type" },
			{ status: 415 }
		)
	}

	// Bytes are already buffered by `formData()`; reading 12 more bytes here is
	// cheap and lets us reject a payload whose Content-Type lies about its
	// contents (e.g. `image/png` header on a `text/html` body).
	const headerBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
	const detectedMime = detectImageMime(headerBytes)

	if (detectedMime === null || detectedMime !== file.type) {
		// eslint-disable-next-line no-console
		console.warn("[api:upload:POST] mime mismatch", {
			claimedType: file.type,
			detectedMime,
		})

		return NextResponse.json(
			{ error: "Unsupported file type" },
			{ status: 415 }
		)
	}

	// Random prefix prevents collisions and guessable URLs for user-uploaded assets.
	// If `file.name` strips entirely, the key ends with a trailing `-`; acceptable.
	const key = `${randomUUID()}-${sanitizeFilename(file.name)}`

	try {
		const blob = await put(key, file, { access: "public" })

		return NextResponse.json({ url: blob.url })
	} catch (error) {
		const requestId = randomUUID().replace(/-/g, "").slice(0, 12)
		// eslint-disable-next-line no-console
		console.error("[api:upload:POST]", { requestId }, error)

		// Keep the user-facing message distinct from the generic 500 helper so
		// the admin UI can show "Upload failed" rather than "Internal server error".
		return NextResponse.json(
			{ error: "Upload failed", requestId },
			{ status: 500 }
		)
	}
}
