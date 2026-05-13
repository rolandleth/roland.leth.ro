import { put } from "@vercel/blob"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	POST,
	detectImageMime,
	sanitizeFilename,
	sanitizeLogString,
} from "./route"

// Real PNG signature so files built by `pngFile()` pass the magic-byte sniff.
// Tests for mismatched bytes use `pngFile({ headerBytes: ... })` to override.
const PNG_HEADER = new Uint8Array([
	0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

vi.mock("@vercel/blob", () => ({
	put: vi.fn(),
}))

// #region sanitizeFilename

describe("sanitizeFilename", () => {
	it("collapses path separators into dashes", () => {
		expect(sanitizeFilename("a/b\\c.png")).toBe("a-b-c.png")
	})

	it("collapses null bytes and whitespace runs into a single dash", () => {
		expect(sanitizeFilename("hello world\t\nfile.png")).toBe(
			"hello-world-file.png"
		)
		expect(sanitizeFilename("foo\0bar.png")).toBe("foo-bar.png")
	})

	it("drops non-ASCII characters entirely", () => {
		// Multibyte unicode (e.g. accented chars, emoji) is stripped — the
		// random UUID prefix carries the uniqueness, the original name is
		// only there for human readability.
		expect(sanitizeFilename("café.png")).toBe("caf.png")
		expect(sanitizeFilename("📸.jpg")).toBe(".jpg")
	})

	it("preserves dots, dashes, and underscores", () => {
		expect(sanitizeFilename("my_file-v2.tar.gz")).toBe("my_file-v2.tar.gz")
	})

	it("strips characters that could escape the blob path", () => {
		// Single `/` between segments is not a "run", so it's replaced 1:1
		// with `-`. Path-traversal dots survive the second pass (allowlist
		// preserves `.`), but the slashes that would let them escape the
		// blob key are gone.
		expect(sanitizeFilename("../../etc/passwd")).toBe("..-..-etc-passwd")
	})

	it("returns an empty string when every char is stripped", () => {
		// Edge: this means the resulting key ends with a trailing `-` from
		// the `${uuid}-${sanitized}` template. Pinned here so a future
		// refactor that changes the contract is forced to acknowledge it.
		expect(sanitizeFilename("///")).toBe("-")
		expect(sanitizeFilename("📸")).toBe("")
	})
})

// #endregion

// #region sanitizeLogString

describe("sanitizeLogString", () => {
	it("collapses CR / LF / TAB / NUL into single spaces", () => {
		// Log injection: attacker-controlled bytes in `error.message` from the
		// multipart parser could otherwise forge fake log lines beneath the
		// real one. Newlines are the primary vector — strip them.
		expect(sanitizeLogString("line1\nline2")).toBe("line1 line2")
		expect(sanitizeLogString("line1\r\nline2")).toBe("line1 line2")
		expect(sanitizeLogString("col1\tcol2")).toBe("col1 col2")
		expect(sanitizeLogString("a\0b")).toBe("a b")
	})

	it("collapses runs of mixed control characters into a single space", () => {
		expect(sanitizeLogString("foo\n\n\r\tbar")).toBe("foo bar")
	})

	it("preserves printable characters", () => {
		expect(sanitizeLogString("Invalid boundary — got --x")).toBe(
			"Invalid boundary — got --x"
		)
	})

	it("clamps absurdly long messages", () => {
		const long = "a".repeat(500)
		const out = sanitizeLogString(long)
		// 200-char cap + ellipsis. Pin the exact length so a future refactor
		// can't silently uncap.
		expect(out.length).toBe(201)
		expect(out.endsWith("…")).toBe(true)
	})

	it("returns the input unchanged when it has no control characters and is short", () => {
		expect(sanitizeLogString("ok")).toBe("ok")
	})
})

// #endregion

// #region detectImageMime

describe("detectImageMime", () => {
	function bytes(...hex: number[]): Uint8Array {
		// Pad to 12 bytes so the check passes the length guard for callers
		// asserting on header-only inputs.
		const buf = new Uint8Array(Math.max(12, hex.length))
		hex.forEach((b, i) => {
			buf[i] = b
		})
		return buf
	}

	it("returns null for inputs shorter than 12 bytes", () => {
		// A truncated header is treated as unknown rather than guessed.
		expect(detectImageMime(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull()
	})

	it("detects PNG", () => {
		expect(
			detectImageMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
		).toBe("image/png")
	})

	it("detects JPEG", () => {
		expect(detectImageMime(bytes(0xff, 0xd8, 0xff))).toBe("image/jpeg")
	})

	it("detects GIF (87a and 89a)", () => {
		expect(detectImageMime(bytes(0x47, 0x49, 0x46, 0x38, 0x37, 0x61))).toBe(
			"image/gif"
		)
		expect(detectImageMime(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))).toBe(
			"image/gif"
		)
	})

	it("detects WebP", () => {
		expect(
			detectImageMime(
				bytes(
					0x52,
					0x49,
					0x46,
					0x46,
					0x00,
					0x00,
					0x00,
					0x00,
					0x57,
					0x45,
					0x42,
					0x50
				)
			)
		).toBe("image/webp")
	})

	it("detects AVIF major brands (avif, avis, mif1)", () => {
		for (const brand of ["avif", "avis", "mif1"]) {
			const b = bytes(0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70)
			b[8] = brand.charCodeAt(0)
			b[9] = brand.charCodeAt(1)
			b[10] = brand.charCodeAt(2)
			b[11] = brand.charCodeAt(3)
			expect(detectImageMime(b)).toBe("image/avif")
		}
	})

	it("returns null for HTML disguised as an image", () => {
		// `<!DOCTYPE` would be a typical XSS-shaped payload.
		const html = new TextEncoder().encode("<!DOCTYPE html><html>")
		expect(detectImageMime(html)).toBeNull()
	})

	it("returns null for a bare ftyp with an unknown brand", () => {
		// `mp4 ` is a valid ftyp brand but not in the allowlist.
		const b = bytes(0x00, 0x00, 0x00, 0x00, 0x66, 0x74, 0x79, 0x70)
		b[8] = 0x6d
		b[9] = 0x70
		b[10] = 0x34
		b[11] = 0x20
		expect(detectImageMime(b)).toBeNull()
	})
})

// #endregion

// #region POST /api/upload

describe("POST /api/upload", () => {
	beforeEach(() => {
		vi.stubEnv("ALLOW_UPLOADS", "true")
		// `restoreMocks: true` in the global config restores spies but does
		// not clear call history on `vi.fn()`s declared inside `vi.mock(...)`
		// factories. Without this, `not.toHaveBeenCalled()` and
		// `mock.calls[0]` would see leftovers from earlier tests.
		vi.mocked(put).mockReset()
		vi.mocked(put).mockResolvedValue({
			url: "https://blob.example.com/abc-test.png",
		} as Awaited<ReturnType<typeof put>>)
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	function uploadRequest(formData: FormData): Request {
		return new Request("http://localhost/api/upload", {
			method: "POST",
			body: formData,
		})
	}

	function pngFile({
		name = "test.png",
		type = "image/png",
		size = 1024,
		headerBytes = PNG_HEADER,
	}: {
		name?: string
		type?: string
		size?: number
		headerBytes?: Uint8Array
	} = {}): File {
		// First N bytes are a real magic-byte header (so the route's
		// `detectImageMime` accepts the file); the rest is zero padding. Tests
		// that need a mismatched header pass a different `headerBytes`.
		const buffer = new Uint8Array(Math.max(size, headerBytes.length))
		buffer.set(headerBytes, 0)
		return new File([buffer], name, { type })
	}

	it("returns 403 when ALLOW_UPLOADS is not enabled", async () => {
		// Guard against accidentally writing to the real Vercel Blob store
		// from a dev shell or unconfigured deploy. The single-user admin's
		// upload UI is gated behind auth, but the route itself is the
		// load-bearing check. Explicit env flag (instead of NODE_ENV gating)
		// so dev/test/preview/production are configurable independently.
		vi.stubEnv("ALLOW_UPLOADS", "")
		const formData = new FormData()
		formData.append("file", pngFile())

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(403)
		expect(put).not.toHaveBeenCalled()
	})

	it("returns 400 when no file field is present", async () => {
		const response = await POST(uploadRequest(new FormData()))
		expect(response.status).toBe(400)
		expect(put).not.toHaveBeenCalled()
	})

	it("returns 400 when the `file` field is a string, not a File", async () => {
		const formData = new FormData()
		formData.append("file", "not-a-file")

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(400)
		expect(put).not.toHaveBeenCalled()
	})

	it("returns 413 when the file exceeds 10 MiB", async () => {
		const formData = new FormData()
		// 1 byte over the documented 10 MiB cap.
		formData.append("file", pngFile({ size: 10 * 1024 * 1024 + 1 }))

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(413)
		expect(put).not.toHaveBeenCalled()
	})

	it("accepts a file at exactly the 10 MiB boundary", async () => {
		const formData = new FormData()
		formData.append("file", pngFile({ size: 10 * 1024 * 1024 }))

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(200)
		expect(put).toHaveBeenCalledTimes(1)
	})

	it("rejects oversize uploads via Content-Length precheck before parsing the body", async () => {
		// formData() buffers the whole body before returning, so checking
		// file.size afterwards is too late. The Content-Length header lets us
		// short-circuit early. Build a Request with the header set, no body.
		const oversizeRequest = new Request("http://localhost/api/upload", {
			method: "POST",
			headers: { "content-length": String(10 * 1024 * 1024 + 1) },
			body: new FormData(),
		})

		const response = await POST(oversizeRequest)
		expect(response.status).toBe(413)
		expect(put).not.toHaveBeenCalled()
	})

	it("returns 400 when the multipart body is malformed", async () => {
		// formData() throws on a body that claims multipart but isn't.
		const badRequest = new Request("http://localhost/api/upload", {
			method: "POST",
			headers: {
				"content-type": "multipart/form-data; boundary=---bad",
			},
			body: "garbage that does not match the boundary",
		})

		const response = await POST(badRequest)
		expect(response.status).toBe(400)
		expect(put).not.toHaveBeenCalled()
	})

	it("logs a tagged warn on malformed multipart so the 400 isn't silent", async () => {
		// Regression: previously the only un-logged 4xx in the route. A botnet
		// sending garbage bodies got a clean 400 with zero log signal,
		// inconsistent with the route's other 4xx (oversize / mime / mismatch).
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
		const badRequest = new Request("http://localhost/api/upload", {
			method: "POST",
			headers: {
				"content-type": "multipart/form-data; boundary=---bad",
			},
			body: "garbage that does not match the boundary",
		})

		await POST(badRequest)
		expect(warn).toHaveBeenCalledWith(
			"[api:upload:POST] malformed multipart",
			expect.objectContaining({ message: expect.any(String) })
		)
		// Log-injection guard: whatever the parser said, the message field
		// must be single-line. A multi-line `error.message` would let an
		// attacker forge fake log lines below the real one.
		const loggedMessage = (warn.mock.calls.at(-1)?.[1] as { message: string })
			.message
		expect(loggedMessage).not.toMatch(/[\r\n\t\0]/)
		warn.mockRestore()
	})

	it("returns 415 for a disallowed MIME (text/html)", async () => {
		const formData = new FormData()
		formData.append("file", pngFile({ type: "text/html", name: "evil.html" }))

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(415)
		expect(put).not.toHaveBeenCalled()
	})

	it("returns 415 for image/svg+xml (XSS-shaped, intentionally disallowed)", async () => {
		// SVG is valid markup that browsers will execute scripts inside; the
		// allowlist deliberately excludes it.
		const formData = new FormData()
		formData.append("file", pngFile({ type: "image/svg+xml", name: "x.svg" }))

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(415)
		expect(put).not.toHaveBeenCalled()
	})

	it("returns 415 when the file's bytes don't match the claimed image MIME", async () => {
		// Defends against a payload mislabelled as an allowed type — e.g.
		// HTML bytes inside a file announced as `image/png`. The allowlist
		// trusts `file.type`; the magic-byte sniff is the catch.
		const htmlBytes = new TextEncoder().encode(
			"<!DOCTYPE html><html><script>alert(1)</script></html>"
		)
		const formData = new FormData()
		formData.append(
			"file",
			pngFile({ type: "image/png", headerBytes: htmlBytes })
		)

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(415)
		expect(put).not.toHaveBeenCalled()
		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:upload:POST] mime mismatch",
			expect.objectContaining({ claimedType: "image/png" })
		)
	})

	it("logs a warn line on the Content-Length oversize precheck", async () => {
		// 413 paths are interesting signals (potentially attempted abuse);
		// surface to logs rather than silently rejecting. Key is `size: number`
		// to match the post-parse 413 below, so one grep covers both branches.
		const declaredSize = 10 * 1024 * 1024 + 1
		const oversizeRequest = new Request("http://localhost/api/upload", {
			method: "POST",
			headers: { "content-length": String(declaredSize) },
			body: new FormData(),
		})

		await POST(oversizeRequest)

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:upload:POST] oversize precheck",
			{ size: declaredSize }
		)
	})

	it("does not short-circuit on a negative Content-Length (precheck guards on non-negative finite numbers)", async () => {
		// `Number("-1") === -1`, which is `< MAX_UPLOAD_BYTES`, so without the
		// `>= 0` guard the precheck would silently let an obviously malformed
		// header bypass into `formData()`. The post-parse cap still catches
		// the real size, but the precheck should reject before parsing.
		const formData = new FormData()
		formData.append("file", pngFile())
		const request = new Request("http://localhost/api/upload", {
			method: "POST",
			headers: { "content-length": "-1" },
			body: formData,
		})

		const response = await POST(request)

		// Reaches the happy path because the file itself is valid; what we're
		// pinning is that the precheck does NOT log an oversize warn for a
		// negative declared size.
		expect(response.status).toBe(200)
		const oversizeCalls = vi
			.mocked(console.warn)
			.mock.calls.filter(
				(args) => args[0] === "[api:upload:POST] oversize precheck"
			)
		expect(oversizeCalls).toHaveLength(0)
	})

	it("does not short-circuit on a non-numeric Content-Length", async () => {
		// `Number("abc") === NaN`, which is `> MAX_UPLOAD_BYTES` is false but
		// the previous guard treated `null` and `NaN` differently; the explicit
		// `Number.isFinite` check makes the contract clear and survives a
		// future refactor that flips the comparison.
		const formData = new FormData()
		formData.append("file", pngFile())
		const request = new Request("http://localhost/api/upload", {
			method: "POST",
			headers: { "content-length": "abc" },
			body: formData,
		})

		const response = await POST(request)

		expect(response.status).toBe(200)
		const oversizeCalls = vi
			.mocked(console.warn)
			.mock.calls.filter(
				(args) => args[0] === "[api:upload:POST] oversize precheck"
			)
		expect(oversizeCalls).toHaveLength(0)
	})

	it("logs a warn line on the disallowed-mime 415 path", async () => {
		const formData = new FormData()
		formData.append("file", pngFile({ type: "text/html", name: "evil.html" }))

		await POST(uploadRequest(formData))

		expect(vi.mocked(console.warn)).toHaveBeenCalledWith(
			"[api:upload:POST] disallowed mime",
			{ claimedType: "text/html" }
		)
	})

	it("returns 200 with the blob URL on success", async () => {
		const formData = new FormData()
		formData.append("file", pngFile())

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(200)

		const data = await response.json()
		expect(data.url).toBe("https://blob.example.com/abc-test.png")
	})

	it("calls `put` with a UUID-prefixed, sanitized key", async () => {
		const formData = new FormData()
		formData.append("file", pngFile({ name: "my photo.png" }))

		await POST(uploadRequest(formData))

		const [key, file, options] = vi.mocked(put).mock.calls[0]
		// `${uuid}-${sanitized}`; UUID v4 has 36 chars + `-` separator.
		expect(key).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-my-photo\.png$/
		)
		expect(file).toBeInstanceOf(File)
		expect(options).toEqual({ access: "public" })
	})

	it("returns 500 when the blob client throws", async () => {
		vi.mocked(put).mockRejectedValueOnce(new Error("blob store unreachable"))
		const formData = new FormData()
		formData.append("file", pngFile())

		const response = await POST(uploadRequest(formData))
		expect(response.status).toBe(500)

		const data = await response.json()
		// Internal error message must not leak to the client.
		expect(data.error).toBe("Upload failed")
		expect(data.error).not.toContain("blob store unreachable")
		// requestId must be present for log correlation (matches respondInternalError pattern).
		expect(data.requestId).toMatch(/^[0-9a-f]{12}$/)
	})
})

// #endregion
