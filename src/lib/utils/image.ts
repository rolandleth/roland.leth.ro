// The image types the site stores. Shared by the admin upload route, which
// sniffs for them, and the post importer, which accepts them by extension.
// Pure, so it reaches the client bundle.

/**
 * The file extension each image type is stored under. SVG is left out on
 * purpose: it can carry script.
 */
export const IMAGE_EXTENSIONS = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/avif": "avif",
} as const

export type ImageMime = keyof typeof IMAGE_EXTENSIONS
