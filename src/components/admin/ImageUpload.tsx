"use client"

import { useRef, useState } from "react"

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
	const [isUploading, setIsUploading] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0]

		if (!file) {
			return
		}

		setError(null)
		setIsUploading(true)

		try {
			const formData = new FormData()
			formData.append("file", file)

			const response = await fetch("/api/upload", {
				method: "POST",
				body: formData,
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Upload failed")
			}

			const { url } = await response.json()
			onChange(url)
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed")
		} finally {
			setIsUploading(false)

			if (inputRef.current) {
				inputRef.current.value = ""
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
					className="admin-input min-w-0 flex-1"
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

			{error && <p className="text-sm text-red-500">{error}</p>}
		</div>
	)
}
