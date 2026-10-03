import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import { NextResponse } from "next/server"
import { z } from "zod"
import { parseJsonBody } from "@/lib/api/apiErrors"
import { requireAdmin } from "@/lib/api/requireAdmin"
import { MAX_VIDEO_UPLOAD_BYTES, VIDEO_MIMES } from "@/lib/utils/video"
import {
	adminUploadKey,
	refuseDisabledUploads,
	respondUploadFailed,
} from "../uploadHelpers"

const TAG = "[api:admin:upload:video:POST]"

/** Longest filename a file system hands out; a longer one is not a real file's. */
const MAX_FILENAME_LENGTH = 255

// A video can't take the image route's path through this server: Vercel caps a
// function's request body at 4.5 MB. The browser sends the file straight to
// Vercel Blob instead, and this route only signs that upload. It authors the
// key and returns a token good for that one key, that one type and nothing
// over the size cap.
//
// What that gives up against the image route: the bytes never reach the
// server, so nothing here can sniff them. The browser sniffs before it asks
// (`detectVideoMime` in `VideoUpload`), which catches the honest mistakes: a
// `.mov`, a renamed file. A request that lies about its type gets a blob stored
// under the type the token names, which then fails to play; it is served from
// the Blob origin, never this one.
const bodySchema = z.object({
	filename: z.string().min(1).max(MAX_FILENAME_LENGTH),
	contentType: z.enum(VIDEO_MIMES),
})

export async function POST(request: Request): Promise<NextResponse> {
	const unauthorized = await requireAdmin(request, TAG)

	if (unauthorized) {
		return unauthorized
	}

	// Before the uploads switch, unlike the image route: the body here is a few
	// bytes of JSON, so there is no large parse to skip, and the content-type
	// refusal is a CSRF layer that should answer whatever the switch says.
	const parsed = await parseJsonBody(request, bodySchema, TAG)

	if (parsed instanceof NextResponse) {
		return parsed
	}

	const disabled = refuseDisabledUploads()

	if (disabled) {
		return disabled
	}

	// Authored here, never taken from the client, so every video lands under the
	// key shape `yarn blob:prune-uploads` recognizes and the extension the
	// markdown renderer reads as a video.
	const pathname = adminUploadKey(parsed.filename, parsed.contentType)

	try {
		const token = await generateClientTokenFromReadWriteToken({
			pathname,
			allowedContentTypes: [parsed.contentType],
			maximumSizeInBytes: MAX_VIDEO_UPLOAD_BYTES,
			// A suffix would change the key after it was authored above.
			addRandomSuffix: false,
		})

		return NextResponse.json({ pathname, token })
	} catch (error) {
		return respondUploadFailed(TAG, error)
	}
}
