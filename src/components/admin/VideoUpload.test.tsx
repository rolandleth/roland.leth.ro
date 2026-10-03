import { render, screen, waitFor } from "@testing-library/react"
import { put } from "@vercel/blob/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MAX_VIDEO_UPLOAD_BYTES, MAX_VIDEO_UPLOAD_MIB } from "@/lib/utils/video"
import { ebmlHeader, ftypBox } from "@/test/mediaBytes"
import { setupUser } from "@/test/user"
import VideoUpload from "./VideoUpload"

const user = setupUser()

vi.mock("@vercel/blob/client", () => ({
	put: vi.fn(),
}))

type PutOptions = Parameters<typeof put>[2]

const KEY = "0f8e4b1c-2d3a-4e5f-8a9b-0c1d2e3f4a5b-clip.mp4"
const BLOB_URL = `https://store.public.blob.vercel-storage.com/${KEY}`

/** A file whose leading bytes are a real MP4's, so the sniff accepts it. */
function mp4File(name = "clip.mp4"): File {
	return new File([ftypBox("isom", ["isom", "mp41"])], name, {
		type: "video/mp4",
	})
}

function webmFile(name = "clip.webm"): File {
	return new File([ebmlHeader("webm")], name, { type: "video/webm" })
}

/**
 * A QuickTime movie renamed to `.mp4`: the browser reports `video/mp4` from the
 * extension, and only the bytes say otherwise.
 */
function renamedMovFile(): File {
	return new File([ftypBox("qt  ", ["qt  "])], "clip.mp4", {
		type: "video/mp4",
	})
}

/** `file` reporting `size` bytes, without allocating them. */
function withSize(file: File, size: number): File {
	Object.defineProperty(file, "size", { value: size })

	return file
}

function jsonResponse(ok: boolean, body: object, status = ok ? 200 : 500) {
	return {
		ok,
		status,
		headers: {
			get: (name: string) =>
				name === "content-type" ? "application/json" : null,
		},
		json: () => Promise.resolve(body),
	}
}

/** The token route answering with a signed upload for `KEY`. */
function mockTokenRoute() {
	global.fetch = vi
		.fn()
		.mockResolvedValue(jsonResponse(true, { pathname: KEY, token: "token" }))
}

interface PendingPut {
	options: PutOptions
	resolve: (url?: string) => void
	reject: (error: Error) => void
}

/**
 * Blob uploads that stay in flight until the test settles them. Unlike `fetch`,
 * these do not settle on abort by themselves: a test decides what an aborted
 * upload does, since the SDK may still resolve or reject with its own error.
 */
function mockPendingPuts(): PendingPut[] {
	const pending: PendingPut[] = []

	vi.mocked(put).mockImplementation(
		(_pathname, _body, options) =>
			new Promise((resolve, reject) => {
				pending.push({
					options,
					resolve: (url = BLOB_URL) =>
						resolve({ url } as Awaited<ReturnType<typeof put>>),
					reject,
				})
			})
	)

	return pending
}

function fileInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]')

	if (input == null) {
		throw new Error("No file input rendered")
	}

	return input
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

// #region Rendering

describe("VideoUpload rendering", () => {
	it("renders an idle upload button", () => {
		render(<VideoUpload onUploaded={vi.fn()} />)

		expect(screen.getByRole("button", { name: "Upload video" })).toBeEnabled()
	})

	it("offers only the video types the site plays", () => {
		render(<VideoUpload onUploaded={vi.fn()} />)

		expect(fileInput()).toHaveAttribute("accept", "video/mp4,video/webm")
	})
})

// #endregion

// #region Upload

describe("VideoUpload upload", () => {
	it("asks the route to sign the upload, naming the file and its sniffed type", async () => {
		mockTokenRoute()
		mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File("Screen Recording.mp4"))

		await waitFor(() => expect(global.fetch).toHaveBeenCalled())

		const [url, init] = vi.mocked(global.fetch).mock.calls[0]

		expect(url).toBe("/api/admin/upload/video")
		expect(init?.method).toBe("POST")
		expect(init?.headers).toEqual({ "Content-Type": "application/json" })
		expect(JSON.parse(init?.body as string)).toEqual({
			filename: "Screen Recording.mp4",
			contentType: "video/mp4",
		})
	})

	it("sends the file to Blob under the signed key, with the token and the type", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const file = mp4File()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), file)

		await waitFor(() => expect(pending).toHaveLength(1))

		const [pathname, body, options] = vi.mocked(put).mock.calls[0]

		expect(pathname).toBe(KEY)
		expect(body).toBe(file)
		expect(options).toMatchObject({
			access: "public",
			token: "token",
			contentType: "video/mp4",
		})
	})

	it("hands the stored URL to onUploaded", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const onUploaded = vi.fn()

		render(<VideoUpload onUploaded={onUploaded} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		pending[0].resolve()

		await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(BLOB_URL))
		expect(onUploaded).toHaveBeenCalledTimes(1)
	})

	it("declares a WebM as video/webm", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), webmFile())
		await waitFor(() => expect(pending).toHaveLength(1))

		const [, init] = vi.mocked(global.fetch).mock.calls[0]

		expect(JSON.parse(init?.body as string).contentType).toBe("video/webm")
		expect(pending[0].options.contentType).toBe("video/webm")
	})

	it("trusts the bytes over the type the browser reports", async () => {
		// A WebM named `.mp4`: the browser says `video/mp4`, the bytes say WebM.
		mockTokenRoute()
		const pending = mockPendingPuts()
		const mislabelled = new File([ebmlHeader("webm")], "clip.mp4", {
			type: "video/mp4",
		})

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mislabelled)
		await waitFor(() => expect(pending).toHaveLength(1))

		expect(pending[0].options.contentType).toBe("video/webm")
	})

	it("clears the file input once the upload lands, so the same file can be picked again", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const onUploaded = vi.fn()

		render(<VideoUpload onUploaded={onUploaded} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		pending[0].resolve()

		await waitFor(() => expect(onUploaded).toHaveBeenCalled())
		expect(fileInput().value).toBe("")
	})
})

// #endregion

// #region Progress

describe("VideoUpload progress", () => {
	it("shows the upload's progress on the disabled button", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		expect(screen.getByRole("button", { name: "Uploading… 0%" })).toBeDisabled()

		pending[0].options.onUploadProgress?.({
			loaded: 424,
			total: 1000,
			percentage: 42.4,
		})

		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Uploading… 42%" })
			).toBeDisabled()
		)
	})

	it("returns to the idle button once the upload lands", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		pending[0].resolve()

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Upload video" })).toBeEnabled()
		)
	})

	it("starts the next upload at 0%, not at the last one's figure", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File("a.mp4"))
		await waitFor(() => expect(pending).toHaveLength(1))

		pending[0].options.onUploadProgress?.({
			loaded: 1000,
			total: 1000,
			percentage: 100,
		})
		pending[0].resolve()
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Upload video" })).toBeEnabled()
		)

		await user.upload(fileInput(), mp4File("b.mp4"))
		await waitFor(() => expect(pending).toHaveLength(2))

		expect(
			screen.getByRole("button", { name: "Uploading… 0%" })
		).toBeInTheDocument()
	})
})

// #endregion

// #region Refusals before anything is sent

describe("VideoUpload refusals", () => {
	it("refuses a QuickTime movie renamed to .mp4, without sending anything", async () => {
		mockTokenRoute()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), renamedMovFile())

		await waitFor(() =>
			expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
		)
		expect(screen.getByText(/convert a \.mov to MP4/)).toBeInTheDocument()
		expect(global.fetch).not.toHaveBeenCalled()
		expect(put).not.toHaveBeenCalled()
	})

	it("refuses a file that is not a video at all", async () => {
		mockTokenRoute()
		const page = new File(["<!doctype html><html></html>"], "clip.mp4", {
			type: "video/mp4",
		})

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), page)

		await waitFor(() =>
			expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
		)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("refuses an empty file", async () => {
		mockTokenRoute()
		const empty = new File([], "clip.mp4", { type: "video/mp4" })

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), empty)

		await waitFor(() =>
			expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
		)
		expect(global.fetch).not.toHaveBeenCalled()
	})

	it("refuses a file over the size cap, without sending anything", async () => {
		mockTokenRoute()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(
			fileInput(),
			withSize(mp4File(), MAX_VIDEO_UPLOAD_BYTES + 1)
		)

		await waitFor(() =>
			expect(
				screen.getByText(`File exceeds ${MAX_VIDEO_UPLOAD_MIB} MiB limit`)
			).toBeInTheDocument()
		)
		expect(global.fetch).not.toHaveBeenCalled()
		expect(put).not.toHaveBeenCalled()
	})

	it("accepts a file at exactly the size cap", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), withSize(mp4File(), MAX_VIDEO_UPLOAD_BYTES))

		await waitFor(() => expect(pending).toHaveLength(1))
	})

	it("unlocks the button after a refusal", async () => {
		mockTokenRoute()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), renamedMovFile())

		await waitFor(() =>
			expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
		)
		expect(screen.getByRole("button", { name: "Upload video" })).toBeEnabled()
	})

	it("clears the last error when a new upload starts", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), renamedMovFile())
		await waitFor(() =>
			expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
		)

		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		expect(screen.queryByText(/Unsupported file type/)).not.toBeInTheDocument()
	})
})

// #endregion

// #region Failures

describe("VideoUpload failures", () => {
	it("shows the route's error with the HTTP status, and sends nothing to Blob", async () => {
		global.fetch = vi
			.fn()
			.mockResolvedValue(
				jsonResponse(
					false,
					{ error: "Uploads are disabled (set ALLOW_UPLOADS=true to enable)" },
					403
				)
			)

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File())

		await waitFor(() =>
			expect(
				screen.getByText(
					"Uploads are disabled (set ALLOW_UPLOADS=true to enable) (HTTP 403)"
				)
			).toBeInTheDocument()
		)
		expect(put).not.toHaveBeenCalled()
	})

	it("shows the Blob error when the upload itself fails", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const onUploaded = vi.fn()

		render(<VideoUpload onUploaded={onUploaded} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		pending[0].reject(new Error("Vercel Blob: Access denied"))

		await waitFor(() =>
			expect(screen.getByText("Vercel Blob: Access denied")).toBeInTheDocument()
		)
		expect(onUploaded).not.toHaveBeenCalled()
		expect(screen.getByRole("button", { name: "Upload video" })).toBeEnabled()
	})

	it("logs a failed upload under its own tag", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
		const cause = new Error("Vercel Blob: Access denied")

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		pending[0].reject(cause)

		await waitFor(() =>
			expect(warn).toHaveBeenCalledWith(
				"[admin:VideoUpload] upload failed",
				cause
			)
		)
	})
})

// #endregion

// #region Upload reporting

describe("VideoUpload onUploadingChange", () => {
	it("reports true while an upload is in flight and false once it lands", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const onUploadingChange = vi.fn()

		render(
			<VideoUpload onUploaded={vi.fn()} onUploadingChange={onUploadingChange} />
		)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		expect(onUploadingChange).toHaveBeenLastCalledWith(true)

		pending[0].resolve()

		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(false)
		)
	})

	it("reports false after a refusal, so the form's Save unlocks", async () => {
		mockTokenRoute()
		const onUploadingChange = vi.fn()

		render(
			<VideoUpload onUploaded={vi.fn()} onUploadingChange={onUploadingChange} />
		)
		await user.upload(fileInput(), renamedMovFile())

		await waitFor(() =>
			expect(screen.getByText(/Unsupported file type/)).toBeInTheDocument()
		)
		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(false)
		)
	})

	it("reports false when unmounted mid-upload", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()
		const onUploadingChange = vi.fn()

		const { unmount } = render(
			<VideoUpload onUploaded={vi.fn()} onUploadingChange={onUploadingChange} />
		)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		unmount()

		expect(onUploadingChange).toHaveBeenLastCalledWith(false)
	})
})

// #endregion

// #region Race between two uploads

describe("VideoUpload race handling", () => {
	it("aborts the in-flight upload when a new file is picked", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File("a.mp4"))
		await waitFor(() => expect(pending).toHaveLength(1))

		// The button is disabled mid-upload, but the input can still be reached
		// (a drop, a second dialog already open).
		await user.upload(fileInput(), mp4File("b.mp4"))
		await waitFor(() => expect(pending).toHaveLength(2))

		expect(pending[0].options.abortSignal?.aborted).toBe(true)
		expect(pending[1].options.abortSignal?.aborted).toBe(false)
	})

	it("drops a superseded upload that lands anyway", async () => {
		// The Blob request can finish before the abort reaches it. Its URL must
		// not be inserted next to the newer file's.
		mockTokenRoute()
		const pending = mockPendingPuts()
		const onUploaded = vi.fn()

		render(<VideoUpload onUploaded={onUploaded} />)
		await user.upload(fileInput(), mp4File("a.mp4"))
		await waitFor(() => expect(pending).toHaveLength(1))
		await user.upload(fileInput(), mp4File("b.mp4"))
		await waitFor(() => expect(pending).toHaveLength(2))

		pending[0].resolve("https://store.example.com/old.mp4")
		pending[1].resolve("https://store.example.com/new.mp4")

		await waitFor(() =>
			expect(onUploaded).toHaveBeenCalledWith(
				"https://store.example.com/new.mp4"
			)
		)
		expect(onUploaded).toHaveBeenCalledTimes(1)
	})

	it("shows no error for an aborted upload, whatever error type it rejects with", async () => {
		// The Blob SDK rejects an aborted request with its own error class, not
		// an `AbortError`.
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File("a.mp4"))
		await waitFor(() => expect(pending).toHaveLength(1))
		await user.upload(fileInput(), mp4File("b.mp4"))
		await waitFor(() => expect(pending).toHaveLength(2))

		pending[0].reject(new Error("Vercel Blob: The request was aborted."))
		pending[1].resolve()

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Upload video" })).toBeEnabled()
		)
		expect(screen.queryByText(/aborted/)).not.toBeInTheDocument()
	})

	it("keeps the button locked while the newer upload is still in flight", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File("a.mp4"))
		await waitFor(() => expect(pending).toHaveLength(1))
		await user.upload(fileInput(), mp4File("b.mp4"))
		await waitFor(() => expect(pending).toHaveLength(2))

		pending[0].reject(new Error("Vercel Blob: The request was aborted."))

		// Give the rejection a turn to be handled before asserting it changed nothing.
		await Promise.resolve()
		expect(screen.getByRole("button", { name: /Uploading…/ })).toBeDisabled()
	})

	it("aborts the in-flight upload on unmount", async () => {
		mockTokenRoute()
		const pending = mockPendingPuts()

		const { unmount } = render(<VideoUpload onUploaded={vi.fn()} />)
		await user.upload(fileInput(), mp4File())
		await waitFor(() => expect(pending).toHaveLength(1))

		unmount()

		expect(pending[0].options.abortSignal?.aborted).toBe(true)
	})
})

// #endregion
