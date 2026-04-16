import { randomUUID } from "node:crypto"
import { put } from "@vercel/blob"
import { NextResponse } from "next/server"

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
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
 */
function sanitizeFilename(name: string): string {
	return name.replace(/[\\/\0\s]+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "")
}

export async function POST(request: Request): Promise<NextResponse> {
	if (process.env.NODE_ENV !== "production") {
		return NextResponse.json(
			{ error: "File uploads are only allowed in production" },
			{ status: 403 }
		)
	}

	const formData = await request.formData()
	const file = formData.get("file")

	if (!(file instanceof File)) {
		return NextResponse.json({ error: "No file provided" }, { status: 400 })
	}

	if (file.size > MAX_UPLOAD_BYTES) {
		return NextResponse.json(
			{ error: "File exceeds 10MB limit" },
			{ status: 413 }
		)
	}

	if (!ALLOWED_UPLOAD_MIMES.has(file.type)) {
		return NextResponse.json(
			{ error: "Unsupported file type" },
			{ status: 415 }
		)
	}

	// Random prefix prevents collisions and guessable URLs for user-uploaded assets.
	const key = `${randomUUID()}-${sanitizeFilename(file.name)}`

	try {
		const blob = await put(key, file, { access: "public" })

		return NextResponse.json({ url: blob.url })
	} catch (error) {
		// eslint-disable-next-line no-console
		console.error(error)

		return NextResponse.json({ error: "Upload failed" }, { status: 500 })
	}
}
