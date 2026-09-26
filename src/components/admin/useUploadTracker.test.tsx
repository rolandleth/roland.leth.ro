import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useUploadTracker } from "./useUploadTracker"

describe("useUploadTracker", () => {
	it("starts with nothing in flight", () => {
		const { result } = renderHook(() => useUploadTracker())

		expect(result.current.isUploading).toBe(false)
	})

	it("is uploading while any key is in flight", () => {
		const { result } = renderHook(() => useUploadTracker())

		act(() => {
			result.current.reportUploading("icon", true)
			result.current.reportUploading("hero", true)
			result.current.reportUploading("icon", false)
		})

		expect(result.current.isUploading).toBe(true)

		act(() => {
			result.current.reportUploading("hero", false)
		})

		expect(result.current.isUploading).toBe(false)
	})

	it("treats a repeated report as one upload, not two", () => {
		// `ImageUpload` reports from an effect, which can run more than once for
		// the same upload; a counter would need two `false` reports to clear.
		const { result } = renderHook(() => useUploadTracker())

		act(() => {
			result.current.reportUploading("icon", true)
			result.current.reportUploading("icon", true)
			result.current.reportUploading("icon", false)
		})

		expect(result.current.isUploading).toBe(false)
	})

	it("ignores a finish for a key that never started", () => {
		// A mounted `ImageUpload` reports `false` on its first effect run.
		const { result } = renderHook(() => useUploadTracker())

		act(() => {
			result.current.reportUploading("icon", false)
		})

		expect(result.current.isUploading).toBe(false)
	})

	it("keeps reportUploading stable across renders", () => {
		const { result, rerender } = renderHook(() => useUploadTracker())
		const first = result.current.reportUploading

		act(() => {
			result.current.reportUploading("icon", true)
		})
		rerender()

		expect(result.current.reportUploading).toBe(first)
	})
})
