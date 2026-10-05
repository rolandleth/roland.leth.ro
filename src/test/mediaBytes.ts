// Leading bytes of real media files, for the tests of the upload sniffs. Typed
// as `Uint8Array<ArrayBuffer>` so a test can also put them in a `File`.

/** An `ftyp` box: size, `ftyp`, major brand, minor version 0, compatible brands. */
export function ftypBox(
	major: string,
	compatible: string[]
): Uint8Array<ArrayBuffer> {
	const size = 16 + compatible.length * 4
	const box = new Uint8Array(size)
	new DataView(box.buffer).setUint32(0, size)
	const text = ["ftyp", major, "\0\0\0\0", ...compatible].join("")
	box.set(new TextEncoder().encode(text), 4)

	return box
}

/**
 * An EBML header naming `docType`, laid out as ffmpeg writes it: the magic
 * number, the header size, the four version and length fields, then the
 * `DocType` element (`42 82`, a one-byte length, the name).
 */
export function ebmlHeader(docType: string): Uint8Array<ArrayBuffer> {
	const name = new TextEncoder().encode(docType)
	const fields = [
		0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04,
		0x42, 0xf3, 0x81, 0x08,
	]
	const docTypeElement = [0x42, 0x82, 0x80 | name.length, ...name]
	const body = [...fields, ...docTypeElement]

	return new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x80 | body.length, ...body])
}
