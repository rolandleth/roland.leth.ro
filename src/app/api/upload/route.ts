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

export async function POST(request: Request): Promise<NextResponse> {
	if (process.env.NODE_ENV !== "production") {
		return NextResponse.json(
			{ error: "File uploads are only allowed in production" },
			{ status: 403 }
		)
	}

	let formData: FormData

	try {
		formData = await request.formData()
	} catch {
		// A malformed multipart body throws from `formData()`; surface a 400
		// rather than letting the rejection bubble as an uncaught exception.
		return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
	}

	const file = formData.get("file")

	if (!(file instanceof File)) {
		return NextResponse.json({ error: "No file provided" }, { status: 400 })
	}

	if (file.size > MAX_UPLOAD_BYTES) {
		return NextResponse.json(
			{ error: `File exceeds ${MAX_UPLOAD_MIB} MiB limit` },
			{ status: 413 }
		)
	}

	// `file.type` is set by the client and trivially spoofable; this allowlist
	// guards against the casual case (drag-and-drop of a `.html`) and against
	// SVG specifically (XSS-shaped). It is NOT a defence against a malicious
	// uploader — sniff magic bytes server-side if that threat model matters.
	// Acceptable here because the only caller is the single-user admin UI.
	if (!ALLOWED_UPLOAD_MIMES.has(file.type)) {
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
		// eslint-disable-next-line no-console
		console.error("[api:upload:POST]", error)

		// Keep the user-facing message distinct from the generic 500 helper so
		// the admin UI can show "Upload failed" rather than "Internal server error".
		return NextResponse.json({ error: "Upload failed" }, { status: 500 })
	}
}
