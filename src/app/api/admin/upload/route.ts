import { randomUUID } from "node:crypto"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { errorMessage } from "@/lib/utils/errorMessage"
import {
	detectImageMime,
	sanitizeFilename,
	sanitizeLogString,
} from "./uploadHelpers"

const MAX_UPLOAD_MIB = 10
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MIB * 1024 * 1024
const ALLOWED_UPLOAD_MIMES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
	"image/avif",
])

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
		console.warn("[api:admin:upload:POST] oversize precheck", {
			size: declaredSize,
		})

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
		const rawMessage = errorMessage(error)
		const safeMessage = sanitizeLogString(rawMessage)
		// eslint-disable-next-line no-console
		console.warn("[api:admin:upload:POST] malformed multipart", {
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
		console.warn("[api:admin:upload:POST] oversize after parse", {
			size: file.size,
		})

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
		console.warn("[api:admin:upload:POST] disallowed mime", {
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
		console.warn("[api:admin:upload:POST] mime mismatch", {
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
		console.error("[api:admin:upload:POST]", { requestId }, error)

		// Keep the user-facing message distinct from the generic 500 helper so
		// the admin UI can show "Upload failed" rather than "Internal server error".
		return NextResponse.json(
			{ error: "Upload failed", requestId },
			{ status: 500 }
		)
	}
}
