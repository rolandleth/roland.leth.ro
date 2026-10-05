// The `ftyp` box that opens every ISO base media file: MP4, QuickTime, HEIF,
// AVIF. Shared by the image sniff (AVIF) and the video sniff (MP4), which tell
// those formats apart by the brands the box names. Pure, so it reaches the
// client bundle.

/** Where the major brand sits: after the 4-byte box size and the `ftyp` tag. */
export const FTYP_MAJOR_BRAND_OFFSET = 8

/** The fewest bytes that hold a box size, the `ftyp` tag and a major brand. */
const FTYP_MIN_BYTES = 12

/** Whether `bytes` opens with an `ftyp` box: the tag at 4-7, after the box size. */
export function hasFtypBox(bytes: Uint8Array): boolean {
	return (
		bytes.length >= FTYP_MIN_BYTES &&
		bytes[4] === 0x66 &&
		bytes[5] === 0x74 &&
		bytes[6] === 0x79 &&
		bytes[7] === 0x70
	)
}

/** The four-character brand code at `offset`. */
export function ftypBrandAt(bytes: Uint8Array, offset: number): string {
	return String.fromCharCode(
		bytes[offset],
		bytes[offset + 1],
		bytes[offset + 2],
		bytes[offset + 3]
	)
}
