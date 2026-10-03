"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { isAbortError } from "@/lib/client/isAbortError"
import type { ChangeEvent, RefObject } from "react"

interface Options {
	/**
	 * Sends `file` and resolves to its public URL. Should stop when `signal`
	 * fires; a result or an error that arrives after that is dropped either way.
	 */
	uploadFile: (file: File, signal: AbortSignal) => Promise<string>
	/** Receives the URL of each upload that lands. */
	onUploaded: (url: string) => void
	/**
	 * Reports the in-flight upload so a parent form can disable Save. Submitting
	 * mid-upload persists the row without the file and then navigates away, which
	 * aborts the request: the picked file is lost with nothing shown.
	 */
	onUploadingChange?: (isUploading: boolean) => void
	/** Opens the console warning for a failed upload, e.g. `[admin:ImageUpload]`. */
	logTag: string
}

interface FileUpload {
	/** For the hidden `<input type="file">`; its value is cleared after each upload. */
	inputRef: RefObject<HTMLInputElement | null>
	isUploading: boolean
	error: string | null
	handleFileChange: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}

/**
 * The state of one file input that uploads what is picked: the in-flight flag,
 * the error, and the abort of a superseded upload. Shared by `ImageUpload` and
 * `VideoUpload`, which differ only in how the file reaches the store.
 */
export function useFileUpload({
	uploadFile,
	onUploaded,
	onUploadingChange,
	logTag,
}: Options): FileUpload {
	const inputRef = useRef<HTMLInputElement>(null)
	// Tracks the currently in-flight upload so a newly-picked file can abort
	// the previous request. Without this, selecting file A and then file B
	// before A completes races: whichever `onUploaded(url)` fires last wins, and
	// it may be the older file.
	const abortRef = useRef<AbortController | null>(null)
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		return () => abortRef.current?.abort()
	}, [])

	// An Effect Event so the effect below re-runs on `isUploading` alone. With
	// the callback as a dependency, a parent passing an inline arrow re-ran it
	// on every render, and the cleanup's `false` plus the body's `true` would
	// churn the parent's state in a loop while an upload is in flight.
	const reportUploading = useEffectEvent((value: boolean) => {
		onUploadingChange?.(value)
	})

	// Mirrored to the parent in an effect rather than from `setIsUploading`'s call
	// sites, so every path that flips it — success, failure, abort — reports.
	// The cleanup covers unmounting mid-upload (the row holding this input was
	// removed): the unmount aborts the request, but the `finally` below can't
	// flip state on an unmounted component, so without it the parent would
	// count this upload as in flight forever and keep Save disabled.
	useEffect(() => {
		reportUploading(isUploading)

		return () => {
			if (isUploading) {
				reportUploading(false)
			}
		}
	}, [isUploading])

	async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0]

		if (!file) {
			return
		}

		abortRef.current?.abort()
		const controller = new AbortController()
		abortRef.current = controller

		setError(null)
		setIsUploading(true)

		try {
			const url = await uploadFile(file, controller.signal)

			// An upload that finished after it was superseded or unmounted. `fetch`
			// rejects on abort and never gets here; an uploader that resolves
			// anyway must not overwrite the newer file's URL.
			if (controller.signal.aborted) {
				return
			}

			onUploaded(url)
		} catch (err) {
			// Aborts are intentional — a newer upload or an unmount cancelled this
			// one. Don't surface that as an error to the user. The signal is checked
			// as well as the error: not every uploader rejects with an `AbortError`
			// (the Blob SDK throws its own type).
			if (controller.signal.aborted || isAbortError(err)) {
				return
			}

			// Tagged warn matches the LoginForm/AdminNav pattern; this runs in a
			// `"use client"` component so the warn does NOT reach Vercel server
			// logs (would need a `/api/log` hop for that), but it surfaces in
			// browser DevTools for the admin debugging a flapping upload.
			// eslint-disable-next-line no-console
			console.warn(`${logTag} upload failed`, err)
			setError(err instanceof Error ? err.message : "Upload failed")
		} finally {
			// Only reset saving state for the most recent request. An older aborted
			// request flipping `isUploading` to false would unlock the UI while a
			// newer request is still in flight.
			if (abortRef.current === controller) {
				setIsUploading(false)

				if (inputRef.current) {
					inputRef.current.value = ""
				}
			}
		}
	}

	return { inputRef, isUploading, error, handleFileChange }
}
