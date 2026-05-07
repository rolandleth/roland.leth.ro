import { put } from "@vercel/blob"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST, sanitizeFilename } from "./route"

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
	}: { name?: string; type?: string; size?: number } = {}): File {
		// `new File([new Uint8Array(size)], …)` lets us control reported
		// size without allocating real image data.
		return new File([new Uint8Array(size)], name, { type })
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
	})
})

// #endregion
