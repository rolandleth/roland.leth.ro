import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { isAdminUploadKey } from "@/lib/import/uploadPrune"
import { isVideoUrl, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/utils/video"
import { POST } from "./route"

vi.mock("@/lib/api/requireAdmin", async () => {
	const { requireAdminMockFactory } = await import("@/test/mocks/requireAdmin")

	return requireAdminMockFactory()
})

vi.mock("@vercel/blob/client", () => ({
	generateClientTokenFromReadWriteToken: vi.fn(),
}))

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

function tokenRequest(body: unknown): Request {
	return new Request("http://localhost/api/admin/upload/video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	})
}

describe("POST /api/admin/upload/video", () => {
	beforeEach(() => {
		vi.stubEnv("ALLOW_UPLOADS", "true")
		// `restoreMocks` does not clear a `vi.fn()` declared in a `vi.mock`
		// factory, so call history would leak between tests without this.
		vi.mocked(generateClientTokenFromReadWriteToken).mockReset()
		vi.mocked(generateClientTokenFromReadWriteToken).mockResolvedValue(
			"client-token"
		)
		vi.spyOn(console, "warn").mockImplementation(() => undefined)
	})

	afterEach(() => {
		vi.unstubAllEnvs()
	})

	// #region Success

	it("returns the token and the key it was issued for", async () => {
		const response = await POST(
			tokenRequest({ filename: "demo.mp4", contentType: "video/mp4" })
		)

		expect(response.status).toBe(200)

		const data = await response.json()

		expect(data.token).toBe("client-token")
		expect(data.pathname).toMatch(new RegExp(`^${UUID}-demo\\.mp4$`))
	})

	it("issues the token for exactly the returned key", async () => {
		const response = await POST(
			tokenRequest({ filename: "demo.mp4", contentType: "video/mp4" })
		)
		const { pathname } = await response.json()
		const [options] = vi.mocked(generateClientTokenFromReadWriteToken).mock
			.calls[0]

		expect(options.pathname).toBe(pathname)
		expect(options.addRandomSuffix).toBe(false)
	})

	it("limits the token to the declared type and the size cap", async () => {
		await POST(
			tokenRequest({ filename: "demo.webm", contentType: "video/webm" })
		)

		const [options] = vi.mocked(generateClientTokenFromReadWriteToken).mock
			.calls[0]

		expect(options.allowedContentTypes).toEqual(["video/webm"])
		expect(options.maximumSizeInBytes).toBe(MAX_VIDEO_UPLOAD_BYTES)
	})

	it("never lets the token overwrite an existing blob", async () => {
		await POST(tokenRequest({ filename: "demo.mp4", contentType: "video/mp4" }))

		const [options] = vi.mocked(generateClientTokenFromReadWriteToken).mock
			.calls[0]

		expect(options.allowOverwrite).not.toBe(true)
	})

	it("takes the extension from the declared type, not the filename", async () => {
		const response = await POST(
			tokenRequest({ filename: "recording.mov", contentType: "video/mp4" })
		)
		const { pathname } = await response.json()

		expect(pathname).toMatch(/-recording\.mp4$/)
	})

	it("strips path separators from the filename", async () => {
		const response = await POST(
			tokenRequest({
				filename: "../../projects/reckon/hero.mp4",
				contentType: "video/mp4",
			})
		)
		const { pathname } = await response.json()

		expect(pathname).not.toContain("/")
		expect(pathname).toMatch(new RegExp(`^${UUID}-`))
	})

	it.each([
		["demo.mp4", "video/mp4"],
		["demo.webm", "video/webm"],
		["📹.mp4", "video/mp4"],
	] as const)(
		"authors a key for %s that the prune sweep and the renderer both recognize",
		async (filename, contentType) => {
			const response = await POST(tokenRequest({ filename, contentType }))
			const { pathname } = await response.json()

			expect(isAdminUploadKey(pathname)).toBe(true)
			expect(isVideoUrl(`https://store.example.com/${pathname}`)).toBe(true)
		}
	)

	it("authors a different key for the same filename each time", async () => {
		const body = { filename: "demo.mp4", contentType: "video/mp4" }
		const first = await (await POST(tokenRequest(body))).json()
		const second = await (await POST(tokenRequest(body))).json()

		expect(first.pathname).not.toBe(second.pathname)
	})

	// #endregion

	// #region Refusals

	it("returns 403 when ALLOW_UPLOADS is not enabled", async () => {
		vi.stubEnv("ALLOW_UPLOADS", "")

		const response = await POST(
			tokenRequest({ filename: "demo.mp4", contentType: "video/mp4" })
		)

		expect(response.status).toBe(403)
		expect(generateClientTokenFromReadWriteToken).not.toHaveBeenCalled()
	})

	it.each([
		"video/quicktime",
		"video/x-matroska",
		"image/png",
		"text/html",
		"video/*",
		"",
	])("returns 400 for the content type %j", async (contentType) => {
		const response = await POST(
			tokenRequest({ filename: "demo.mp4", contentType })
		)

		expect(response.status).toBe(400)
		expect(generateClientTokenFromReadWriteToken).not.toHaveBeenCalled()
	})

	it("returns 400 when the content type is missing", async () => {
		const response = await POST(tokenRequest({ filename: "demo.mp4" }))

		expect(response.status).toBe(400)
		expect(generateClientTokenFromReadWriteToken).not.toHaveBeenCalled()
	})

	it("returns 400 when the filename is missing or empty", async () => {
		const missing = await POST(tokenRequest({ contentType: "video/mp4" }))
		const empty = await POST(
			tokenRequest({ filename: "", contentType: "video/mp4" })
		)

		expect(missing.status).toBe(400)
		expect(empty.status).toBe(400)
		expect(generateClientTokenFromReadWriteToken).not.toHaveBeenCalled()
	})

	it("returns 400 for a filename longer than a file system allows", async () => {
		const response = await POST(
			tokenRequest({
				filename: `${"a".repeat(252)}.mp4`,
				contentType: "video/mp4",
			})
		)

		expect(response.status).toBe(400)
	})

	it("returns 400 when the filename is not a string", async () => {
		const response = await POST(
			tokenRequest({ filename: 42, contentType: "video/mp4" })
		)

		expect(response.status).toBe(400)
	})

	it("returns 400 for a body that is not JSON", async () => {
		const response = await POST(
			new Request("http://localhost/api/admin/upload/video", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: "{not json",
			})
		)

		expect(response.status).toBe(400)
	})

	it("returns 415 for a multipart body, which is how the image route is called", async () => {
		const formData = new FormData()
		formData.append("file", new File(["x"], "demo.mp4", { type: "video/mp4" }))

		const response = await POST(
			new Request("http://localhost/api/admin/upload/video", {
				method: "POST",
				body: formData,
			})
		)

		expect(response.status).toBe(415)
		expect(generateClientTokenFromReadWriteToken).not.toHaveBeenCalled()
	})

	// #endregion

	// #region Failure

	it("returns 500 without the cause when the token can't be issued", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined)
		vi.mocked(generateClientTokenFromReadWriteToken).mockRejectedValueOnce(
			new Error("No token found")
		)

		const response = await POST(
			tokenRequest({ filename: "demo.mp4", contentType: "video/mp4" })
		)

		expect(response.status).toBe(500)

		const data = await response.json()

		expect(data.error).toBe("Upload failed")
		expect(data.requestId).toMatch(/^[0-9a-f]{12}$/)
		expect(data.token).toBeUndefined()
	})

	it("logs the cause under the route's tag with the request id", async () => {
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined)
		const cause = new Error("No token found")
		vi.mocked(generateClientTokenFromReadWriteToken).mockRejectedValueOnce(
			cause
		)

		const response = await POST(
			tokenRequest({ filename: "demo.mp4", contentType: "video/mp4" })
		)
		const { requestId } = await response.json()

		expect(errorSpy).toHaveBeenCalledWith(
			"[api:admin:upload:video:POST]",
			{ requestId },
			cause
		)
	})

	// #endregion
})
