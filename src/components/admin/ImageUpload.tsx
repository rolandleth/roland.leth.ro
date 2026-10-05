"use client"

import { useId } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useFileUpload } from "@/components/admin/useFileUpload"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

interface Props {
	value: string
	onChange: (url: string) => void
	label?: string
	/**
	 * Reports the in-flight upload so a parent form can disable Save. Submitting
	 * mid-upload persists the row without the image and then navigates away, which
	 * aborts the request: the picked file is lost with nothing shown.
	 */
	onUploadingChange?: (isUploading: boolean) => void
}

export default function ImageUpload({
	value,
	onChange,
	label = "Image URL",
	onUploadingChange,
}: Props) {
	const inputId = useId()
	const { inputRef, isUploading, error, handleFileChange } = useFileUpload({
		uploadFile: uploadImage,
		onUploaded: onChange,
		onUploadingChange,
		logTag: "[admin:ImageUpload]",
	})

	return (
		<div className="flex flex-col gap-1.5">
			<label htmlFor={inputId} className="text-secondary text-sm font-medium">
				{label}
			</label>

			<div className="flex gap-2">
				<input
					id={inputId}
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

/** Sends the image through the upload route, which sniffs and stores it. */
async function uploadImage(file: File, signal: AbortSignal): Promise<string> {
	const formData = new FormData()
	formData.append("file", file)

	const response = await fetch("/api/admin/upload", {
		method: "POST",
		body: formData,
		signal,
	})

	if (!response.ok) {
		// Use the shared reader so the admin UI's error surfaces stay
		// consistent across handlers (status suffix, JSON-parse fallback).
		const message = await readErrorMessage(response, "Upload failed")
		throw new Error(message)
	}

	const { url } = await response.json()

	return url
}
