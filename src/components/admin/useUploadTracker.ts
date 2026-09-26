"use client"

import { useCallback, useState } from "react"

interface UploadTracker {
	/** True while at least one tracked upload is in flight. */
	isUploading: boolean
	/**
	 * Records one upload starting or ending. Keyed so several inputs can report
	 * at once, and idempotent so a repeated report changes nothing.
	 */
	reportUploading: (key: string, isUploading: boolean) => void
}

/**
 * Counts in-flight image uploads across a form with more than one
 * `ImageUpload`, so the form can hold Save until every upload has landed. A
 * Save during an upload would store the project without that image. A single
 * boolean (what `PostForm` uses for its one upload) can't do this: the first
 * upload to finish would clear it while another is still running.
 */
export function useUploadTracker(): UploadTracker {
	const [inFlight, setInFlight] = useState<ReadonlySet<string>>(() => new Set())

	const reportUploading = useCallback((key: string, isUploading: boolean) => {
		setInFlight((previous) => {
			// Returning the same set bails out of the re-render, so a report
			// that changes nothing costs nothing.
			if (previous.has(key) === isUploading) {
				return previous
			}

			const next = new Set(previous)

			if (isUploading) {
				next.add(key)
			} else {
				next.delete(key)
			}

			return next
		})
	}, [])

	return { isUploading: inFlight.size > 0, reportUploading }
}
