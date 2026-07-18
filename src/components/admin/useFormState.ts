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
	/** Raw setter, for the occasional compound update `setField` can't express. */
	setState: Dispatch<SetStateAction<T>>
}

/**
 * Form state plus a typed single-field setter — the identical `useState` +
 * `setField` boilerplate every admin form was hand-rolling. `setState` is also
 * returned for compound updates (e.g. a select that adopts a sibling field's
 * value on change).
 */
export function useFormState<T extends object>(initial: T): FormStateHandle<T> {
	const [state, setState] = useState<T>(initial)

	const setField = useCallback(<K extends keyof T>(field: K, value: T[K]) => {
		setState((prev) => ({ ...prev, [field]: value }))
	}, [])

	return { state, setField, setState }
}
