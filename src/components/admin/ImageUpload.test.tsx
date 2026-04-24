import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import ImageUpload from "./ImageUpload"

function pngFile(name: string) {
	return new File(["x"], name, { type: "image/png" })
}

function mockFetchJson(ok: boolean, body: object) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		json: () => Promise.resolve(body),
	})
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
	it("POSTs the selected file to /api/upload and calls onChange with the returned URL", async () => {
		mockFetchJson(true, { url: "https://cdn.example.com/x.png" })
		const onChange = vi.fn()

		render(<ImageUpload value="" onChange={onChange} />)
		const fileInput = document.querySelector(
			'input[type="file"]'
		) as HTMLInputElement

		await userEvent.upload(fileInput, pngFile("a.png"))

		await waitFor(() =>
			expect(onChange).toHaveBeenCalledWith("https://cdn.example.com/x.png")
		)
	})

	it("shows the error message from a non-ok response", async () => {
		mockFetchJson(false, { error: "File too large" })

		render(<ImageUpload value="" onChange={vi.fn()} />)
		const fileInput = document.querySelector(
			'input[type="file"]'
		) as HTMLInputElement
		await userEvent.upload(fileInput, pngFile("a.png"))

		await waitFor(() =>
			expect(screen.getByText(/file too large/i)).toBeInTheDocument()
		)
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
		const fileInput = document.querySelector(
			'input[type="file"]'
		) as HTMLInputElement

		await userEvent.upload(fileInput, pngFile("a.png"))
		await userEvent.upload(fileInput, pngFile("b.png"))

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
		const fileInput = document.querySelector(
			'input[type="file"]'
		) as HTMLInputElement

		await userEvent.upload(fileInput, pngFile("a.png"))
		await waitFor(() => expect(signals.length).toBe(1))

		unmount()
		expect(signals[0].aborted).toBe(true)
	})
})

// #endregion
