"use client"

import { put } from "@vercel/blob/client"
import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useFileUpload } from "@/components/admin/useFileUpload"
import { readErrorMessage } from "@/lib/client/readErrorMessage"
import {
	detectVideoMime,
	MAX_VIDEO_UPLOAD_BYTES,
	MAX_VIDEO_UPLOAD_MIB,
	VIDEO_MIMES,
	VIDEO_SNIFF_HEADER_BYTES,
} from "@/lib/utils/video"

interface Props {
	/** Receives the public URL of each video that lands. */
	onUploaded: (url: string) => void
	/**
	 * Reports the in-flight upload so a parent form can disable Save. A video
	 * takes long enough that a Save and the navigation after it would abort it.
	 */
	onUploadingChange?: (isUploading: boolean) => void
}

/**
 * A button that uploads a video and hands back its URL. It holds no value of
 * its own: a video lives in a markdown body, so the parent decides where the
 * URL goes.
 */
export default function VideoUpload({ onUploaded, onUploadingChange }: Props) {
	const [percentage, setPercentage] = useState(0)
	const { inputRef, isUploading, error, handleFileChange } = useFileUpload({
		uploadFile: (file, signal) => uploadVideo(file, signal, setPercentage),
		onUploaded,
		onUploadingChange,
		logTag: "[admin:VideoUpload]",
	})

	return (
		<div className="flex flex-col items-end gap-1.5">
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				disabled={isUploading}
				className="border-border text-secondary hover:text-primary shrink-0 rounded-md border px-3 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isUploading ? `Uploading… ${percentage}%` : "Upload video"}
			</button>

			<input
				ref={inputRef}
				type="file"
				accept={VIDEO_MIMES.join(",")}
				className="hidden"
				onChange={handleFileChange}
			/>

			{error && <ErrorMessage>{error}</ErrorMessage>}
		</div>
	)
}

/**
 * Sends the video straight to Vercel Blob. The upload route can't carry it (a
 * function's request body stops at 4.5 MB), so that route only signs the
 * upload: it authors the key and returns a token for it.
 *
 * The size and type checks run here, before anything is sent. The token
 * enforces both again, but only after the bytes are on their way, and its
 * refusal says nothing a person can act on.
 */
async function uploadVideo(
	file: File,
	signal: AbortSignal,
	onProgress: (percentage: number) => void
): Promise<string> {
	// The last upload's figure would otherwise show until the first progress event.
	onProgress(0)

	if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
		throw new Error(`File exceeds ${MAX_VIDEO_UPLOAD_MIB} MiB limit`)
	}

	// Sniffed, not read from `file.type`: the browser derives that from the
	// file's extension, so a renamed `.mov` would pass and then never play.
	const header = new Uint8Array(
		await file.slice(0, VIDEO_SNIFF_HEADER_BYTES).arrayBuffer()
	)
	const contentType = detectVideoMime(header)

	if (contentType == null) {
		throw new Error(
			"Unsupported file type. Use an MP4 or WebM video; convert a .mov to MP4 first."
		)
	}

	const response = await fetch("/api/admin/upload/video", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ filename: file.name, contentType }),
		signal,
	})

	if (!response.ok) {
		const message = await readErrorMessage(response, "Upload failed")
		throw new Error(message)
	}

	const { pathname, token } = await response.json()
	const blob = await put(pathname, file, {
		access: "public",
		token,
		contentType,
		abortSignal: signal,
		onUploadProgress: (progress) => onProgress(Math.round(progress.percentage)),
	})

	return blob.url
}
