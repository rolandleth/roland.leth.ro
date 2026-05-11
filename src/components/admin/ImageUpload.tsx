"use client"

import { useEffect, useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { readErrorMessage } from "@/components/admin/useAdminResource"
import { isAbortError } from "@/lib/isAbortError"

interface Props {
	value: string
	onChange: (url: string) => void
	label?: string
}

export default function ImageUpload({
	value,
	onChange,
	label = "Image URL",
}: Props) {
	const inputRef = useRef<HTMLInputElement>(null)
	// Tracks the currently in-flight upload so a newly-picked file can abort
	// the previous request. Without this, selecting file A and then file B
	// before A completes races: whichever `onChange(url)` fires last wins, and
	// it may be the older file.
	const abortRef = useRef<AbortController | null>(null)
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		return () => abortRef.current?.abort()
	}, [])

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]

		if (!file) {
			return
		}

		abortRef.current?.abort()
		const controller = new AbortController()
		abortRef.current = controller

		setError(null)
		setIsUploading(true)

		try {
			const formData = new FormData()
			formData.append("file", file)

			const response = await fetch("/api/upload", {
				method: "POST",
				body: formData,
				signal: controller.signal,
			})

			if (!response.ok) {
				// Use the shared reader so the admin UI's error surfaces stay
				// consistent across handlers (status suffix, JSON-parse fallback).
				const message = await readErrorMessage(response, "Upload failed")
				throw new Error(message)
			}

			const { url } = await response.json()
			onChange(url)
		} catch (err) {
			// Aborts are intentional — a newer upload or an unmount cancelled this
			// one. Don't surface that as an error to the user.
			if (isAbortError(err)) {
				return
			}

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

	return (
		<div className="flex flex-col gap-1.5">
			<label className="text-secondary text-sm font-medium">{label}</label>

			<div className="flex gap-2">
				<input
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="https://..."
					disabled={isUploading}
					className="admin-input min-w-0 flex-1 disabled:opacity-50"
				/>
				<button
					type="button"
					onClick={() => inputRef.current?.click()}
					disabled={isUploading}
					className="border-border text-secondary hover:text-primary shrink-0 rounded-md border px-3 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isUploading ? "Uploading…" : "Upload"}
				</button>
			</div>

			<input
				ref={inputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={handleFileChange}
			/>

			{value && (
				// eslint-disable-next-line @next/next/no-img-element
				<img
					src={value}
					alt="Preview"
					className="border-border mt-1 h-24 w-auto rounded-md border object-contain"
				/>
			)}

			{error && <ErrorMessage>{error}</ErrorMessage>}
		</div>
	)
}
