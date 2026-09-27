"use client"

import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useState,
} from "react"

interface FormStateHandle<T> {
	state: T
	/** Updates one field, preserving the rest — the common case. */
	setField: <K extends keyof T>(field: K, value: T[K]) => void
	/**
	 * Updates one field from its latest value. For changes that land after an
	 * `await` (an image upload finishing), where a value computed at the start
	 * would overwrite every edit made in the meantime.
	 */
	updateField: <K extends keyof T>(
		field: K,
		update: (previous: T[K]) => T[K]
	) => void
	/** Raw setter, for the occasional compound update `setField` can't express. */
	setState: Dispatch<SetStateAction<T>>
	/**
	 * Whether any field differs from the value the form started with. A field
	 * edited and then restored counts as clean again, lists included.
	 */
	isDirty: boolean
}

/**
 * Form state plus a typed single-field setter — the identical `useState` +
 * `setField` boilerplate every admin form was hand-rolling. `setState` is also
 * returned for compound updates (e.g. a select that adopts a sibling field's
 * value on change).
 */
export function useFormState<T extends object>(initial: T): FormStateHandle<T> {
	const [state, setState] = useState<T>(initial)
	// The first render's values; later `initial` arguments are ignored, as they
	// are by `useState`.
	const [baseline] = useState<T>(initial)

	const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
		setState((prev) => ({ ...prev, [field]: value }))
	}, [])

	const updateField = useCallback(
		<K extends keyof T>(field: K, update: (previous: T[K]) => T[K]) => {
			setState((prev) => ({ ...prev, [field]: update(prev[field]) }))
		},
		[]
	)

	const isDirty = (Object.keys(state) as Array<keyof T>).some(
		(field) => !isSameValue(state[field], baseline[field])
	)

	return { state, setField, updateField, setState, isDirty }
}

/**
 * Primitives by value; arrays and objects by their JSON, so a list that got a
 * row added and removed again compares equal. Fine at form sizes: the long
 * strings (a post body) take the primitive path, and the lists are short.
 */
function isSameValue(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true
	}

	if (
		typeof a !== "object" ||
		typeof b !== "object" ||
		a == null ||
		b == null
	) {
		return false
	}

	return JSON.stringify(a) === JSON.stringify(b)
}
