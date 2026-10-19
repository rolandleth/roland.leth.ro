// The upload type checks read a file's leading bytes, not its name. Pure, so
// it reaches the client bundle: the browser sniffs a video before it asks for
// an upload token, the image route sniffs on the server.

/**
 * How many leading bytes the sniffers read: `detectImageMime` on the server,
 * `detectVideoMime` in the browser and in the post importer. Enough for every
 * magic number, an AVIF's `ftyp` compatible brands (encoders write 20 to 40
 * bytes) and a WebM's `DocType` (around byte 24, as the common muxers write
 * it). One value for both, so neither reads past what the other can see.
 */
export const SNIFF_HEADER_BYTES = 64
