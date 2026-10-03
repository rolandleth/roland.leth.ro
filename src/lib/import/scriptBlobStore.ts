import { del, list, put } from "@vercel/blob"
import type { BlobStore } from "@/lib/import/blobSync"

// The real-SDK adapter behind `BlobStore`, shared by the import scripts. It
// acts on whatever store the `BLOB_READ_WRITE_TOKEN` in `.env` names.
//
// SDK-specific knobs live here: content-type is inferred by Blob from the
// key's extension (`.png`, `.mp4`, …), and `allowOverwrite` stays on because a
// `put` can legitimately target an existing key — `--reupload`, and the
// fail-open "treat nothing as existing" path after a transient `list` failure —
// where the content-addressed key guarantees identical bytes anyway.
// Collisions are guarded on the reuse path (size assert in `syncImages`), not
// here.
export const scriptBlobStore: BlobStore = {
	list: (options) => list(options),
	put: async (key, body) => {
		return put(key, Buffer.isBuffer(body) ? body : Buffer.from(body), {
			access: "public",
			addRandomSuffix: false,
			allowOverwrite: true,
		})
	},
	del: (urls) => del(urls),
}
