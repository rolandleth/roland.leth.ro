import { render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import ImageUpload from "./ImageUpload"

const user = setupUser()

function pngFile(name: string) {
	return new File(["x"], name, { type: "image/png" })
}

function jsonResponse(ok: boolean, body: object, status = ok ? 200 : 500) {
	return {
		ok,
		status,
		// `readErrorMessage` (now shared with `IsFeaturedToggle`) gates JSON
		// parsing on the content-type header; the mock must mirror reality.
		headers: {
			get: (name: string) =>
				name === "content-type" ? "application/json" : null,
		},
		json: () => Promise.resolve(body),
	}
}

function mockFetchJson(ok: boolean, body: object, status = ok ? 200 : 500) {
	global.fetch = vi.fn().mockResolvedValue(jsonResponse(ok, body, status))
}

/**
 * Uploads that stay in flight until the test settles them, one settler per
 * request in order, so a test can look at the state mid-upload. Each aborts the
 * way `fetch` does when its signal fires.
 */
function mockPendingFetches(): Array<(ok: boolean) => void> {
	const settlers: Array<(ok: boolean) => void> = []

	global.fetch = vi.fn((_url, init) => {
		const signal = (init as RequestInit).signal as AbortSignal

		return new Promise((resolve, reject) => {
			signal.addEventListener("abort", () =>
				reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
			)
			settlers.push((ok) =>
				resolve(
					jsonResponse(
						ok,
						ok ? { url: "https://cdn.example.com/x.png" } : { error: "Nope" }
					)
				)
			)
		})
	}) as unknown as typeof fetch

	return settlers
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
})

// #region Rendering

describe("ImageUpload rendering", () => {
	it("renders the default label when none is provided", () => {
		render(<ImageUpload value="" onChange={vi.fn()} />)
		expect(screen.getByText(/image url/i)).toBeInTheDocument()
	})

	it("renders a custom label", () => {
		render(<ImageUpload value="" onChange={vi.fn()} label="Hero image" />)
		expect(screen.getByText(/hero image/i)).toBeInTheDocument()
	})

	it("renders a preview when value is set", () => {
		render(<ImageUpload value="https://example.com/a.png" onChange={vi.fn()} />)
		expect(screen.getByAltText("Preview")).toHaveAttribute(
			"src",
			"https://example.com/a.png"
		)
	})
})

// #endregion

// #region Upload happy path

describe("ImageUpload upload", () => {
	it("POSTs the selected file to /api/admin/upload and calls onChange with the returned URL", async () => {
		mockFetchJson(true, { url: "https://cdn.example.com/x.png" })
		const onChange = vi.fn()

		render(<ImageUpload value="" onChange={onChange} />)

		await user.upload(fileInput(), pngFile("a.png"))

		await waitFor(() =>
			expect(onChange).toHaveBeenCalledWith("https://cdn.example.com/x.png")
		)
	})

	it("shows the error message from a non-ok response with the HTTP status suffix", async () => {
		// Pinned through `readErrorMessage`: server's `data.error` plus the
		// `(HTTP NNN)` suffix that all admin error surfaces now share.
		mockFetchJson(false, { error: "File too large" }, 413)

		render(<ImageUpload value="" onChange={vi.fn()} />)
		await user.upload(fileInput(), pngFile("a.png"))

		await waitFor(() =>
			expect(screen.getByText("File too large (HTTP 413)")).toBeInTheDocument()
		)
	})
})

// #endregion

// #region Upload reporting

describe("ImageUpload onUploadingChange", () => {
	// A parent form disables Save on this report. The effect behind it had no
	// test driving the real component: `PostForm.test.tsx` mocks `ImageUpload`
	// and only ever sends `true`.

	it("reports true while an upload is in flight and false once it succeeds", async () => {
		const settlers = mockPendingFetches()
		const onUploadingChange = vi.fn()

		render(
			<ImageUpload
				value=""
				onChange={vi.fn()}
				onUploadingChange={onUploadingChange}
			/>
		)
		await user.upload(fileInput(), pngFile("a.png"))

		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(true)
		)

		settlers[0](true)

		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(false)
		)
	})

	it("reports false after a failed upload, so the form's Save unlocks", async () => {
		// Without the `false`, Save stayed disabled after an upload error until
		// the page was reloaded.
		const settlers = mockPendingFetches()
		const onUploadingChange = vi.fn()

		render(
			<ImageUpload
				value=""
				onChange={vi.fn()}
				onUploadingChange={onUploadingChange}
			/>
		)
		await user.upload(fileInput(), pngFile("a.png"))
		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(true)
		)

		settlers[0](false)

		await waitFor(() => expect(screen.getByText(/Nope/)).toBeInTheDocument())
		// The report comes from a passive effect, which runs after the commit
		// that shows the error, so it can land a tick later under load.
		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(false)
		)
	})

	it("keeps reporting true while a newer upload is still in flight", async () => {
		// Picking a second file aborts the first. The aborted request must not
		// report `false`, or Save unlocks while the second upload is still running.
		const settlers = mockPendingFetches()
		const onUploadingChange = vi.fn()

		render(
			<ImageUpload
				value=""
				onChange={vi.fn()}
				onUploadingChange={onUploadingChange}
			/>
		)
		await user.upload(fileInput(), pngFile("a.png"))
		await user.upload(fileInput(), pngFile("b.png"))
		await waitFor(() => expect(settlers).toHaveLength(2))

		expect(onUploadingChange).toHaveBeenLastCalledWith(true)

		settlers[1](true)

		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(false)
		)
	})

	it("reports false when unmounted mid-upload, so the form's Save unlocks", async () => {
		// Removing the section or image that holds the input unmounts it. The
		// abort's `finally` can't flip state on an unmounted component, so the
		// report has to come from the unmount itself.
		mockPendingFetches()
		const onUploadingChange = vi.fn()

		const { unmount } = render(
			<ImageUpload
				value=""
				onChange={vi.fn()}
				onUploadingChange={onUploadingChange}
			/>
		)
		await user.upload(fileInput(), pngFile("a.png"))
		await waitFor(() =>
			expect(onUploadingChange).toHaveBeenLastCalledWith(true)
		)

		unmount()

		expect(onUploadingChange).toHaveBeenLastCalledWith(false)
	})

	it("reports to the latest callback without re-reporting when only its identity changes", async () => {
		// Forms pass inline arrows. With the callback as an effect dependency,
		// each render re-ran the report and its cleanup, which churned the
		// parent's upload tracker in a loop.
		const settlers = mockPendingFetches()
		const first = vi.fn()
		const second = vi.fn()

		const { rerender } = render(
			<ImageUpload value="" onChange={vi.fn()} onUploadingChange={first} />
		)
		await user.upload(fileInput(), pngFile("a.png"))
		await waitFor(() => expect(first).toHaveBeenLastCalledWith(true))
		const firstCallCount = first.mock.calls.length

		rerender(
			<ImageUpload value="" onChange={vi.fn()} onUploadingChange={second} />
		)
		expect(second).not.toHaveBeenCalled()

		settlers[0](true)

		await waitFor(() => expect(second).toHaveBeenLastCalledWith(false))
		// The end of an upload reports `false` from both the cleanup and the
		// effect body; receivers treat a repeat as a no-op.
		expect(second.mock.calls.every(([value]) => value === false)).toBe(true)
		expect(first).toHaveBeenCalledTimes(firstCallCount)
	})
})

// #endregion

// #region Race between two uploads

describe("ImageUpload race handling", () => {
	it("aborts the in-flight request when a new file is selected", async () => {
		// A second file selection while the first upload is still pending must
		// abort the first; without that, whichever `onChange` fires last wins,
		// which may be the older file.
		const signals: AbortSignal[] = []

		global.fetch = vi.fn((_url, init) => {
			const signal = (init as RequestInit).signal as AbortSignal
			signals.push(signal)

			return new Promise<Response>((_resolve, reject) => {
				signal.addEventListener("abort", () =>
					reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
				)
			})
		}) as unknown as typeof fetch

		render(<ImageUpload value="" onChange={vi.fn()} />)

		await user.upload(fileInput(), pngFile("a.png"))
		await user.upload(fileInput(), pngFile("b.png"))

		await waitFor(() => expect(signals.length).toBe(2))
		await waitFor(() => expect(signals[0].aborted).toBe(true))
		expect(signals[1].aborted).toBe(false)
	})

	it("aborts the in-flight request on unmount", async () => {
		const signals: AbortSignal[] = []

		global.fetch = vi.fn((_url, init) => {
			const signal = (init as RequestInit).signal as AbortSignal
			signals.push(signal)

			return new Promise<Response>((_resolve, reject) => {
				signal.addEventListener("abort", () =>
					reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
				)
			})
		}) as unknown as typeof fetch

		const { unmount } = render(<ImageUpload value="" onChange={vi.fn()} />)

		await user.upload(fileInput(), pngFile("a.png"))
		await waitFor(() => expect(signals.length).toBe(1))

		unmount()
		expect(signals[0].aborted).toBe(true)
	})
})

// #endregion
