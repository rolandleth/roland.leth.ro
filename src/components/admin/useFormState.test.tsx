import { act, renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useFormState } from "./useFormState"

type Form = { name: string; tags: string[] }

const INITIAL: Form = { name: "Reckon", tags: ["a"] }

describe("useFormState", () => {
	it("sets one field and keeps the others", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		act(() => {
			result.current.setField("name", "Continuum")
		})

		expect(result.current.state).toEqual({ name: "Continuum", tags: ["a"] })
	})

	it("updates one field from its latest value and keeps the others", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		act(() => {
			result.current.updateField("tags", (tags) => [...tags, "b"])
		})

		expect(result.current.state).toEqual({ name: "Reckon", tags: ["a", "b"] })
	})

	it("applies back-to-back updates on top of each other", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		act(() => {
			result.current.updateField("tags", (tags) => [...tags, "b"])
			result.current.updateField("tags", (tags) => [...tags, "c"])
		})

		expect(result.current.state.tags).toEqual(["a", "b", "c"])
	})

	it("sees edits made after a handler was captured, as a late upload does", () => {
		const { result } = renderHook(() => useFormState(INITIAL))
		// Captured before the edits below, like an upload's closure before its await.
		const { updateField } = result.current

		act(() => {
			result.current.setField("name", "Renamed")
			result.current.updateField("tags", (tags) => [...tags, "edited"])
		})
		act(() => {
			updateField("tags", (tags) => [...tags, "uploaded"])
		})

		expect(result.current.state).toEqual({
			name: "Renamed",
			tags: ["a", "edited", "uploaded"],
		})
	})

	it("starts clean", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		expect(result.current.isDirty).toBe(false)
	})

	it("is dirty once a field changes", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		act(() => {
			result.current.setField("name", "Continuum")
		})

		expect(result.current.isDirty).toBe(true)
	})

	it("is clean again when the field is changed back", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		act(() => {
			result.current.setField("name", "Continuum")
		})
		act(() => {
			result.current.setField("name", "Reckon")
		})

		expect(result.current.isDirty).toBe(false)
	})

	it("compares lists by content, so a row added and removed again is clean", () => {
		const { result } = renderHook(() => useFormState(INITIAL))

		act(() => {
			result.current.updateField("tags", (tags) => [...tags, "b"])
		})

		expect(result.current.isDirty).toBe(true)

		act(() => {
			result.current.updateField("tags", (tags) => tags.slice(0, 1))
		})

		expect(result.current.isDirty).toBe(false)
	})

	it("keeps the first render's values as the baseline", () => {
		// Forms rebuild their initial object every render, with fresh random
		// keys in ProjectForm; a later argument must not move the baseline.
		const { result, rerender } = renderHook(
			({ initial }) => useFormState(initial),
			{ initialProps: { initial: INITIAL } }
		)

		rerender({ initial: { name: "Other", tags: ["z"] } })

		expect(result.current.isDirty).toBe(false)
	})

	it("keeps setField and updateField stable across renders", () => {
		const { result, rerender } = renderHook(() => useFormState(INITIAL))
		const { setField, updateField } = result.current

		act(() => {
			result.current.setField("name", "Changed")
		})
		rerender()

		expect(result.current.setField).toBe(setField)
		expect(result.current.updateField).toBe(updateField)
	})
})
