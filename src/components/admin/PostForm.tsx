"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { currentDatetimeString } from "@/lib/format"
import { SECTIONS } from "@/lib/sections"

interface Props {
	initialData?: {
		id: number
		title: string
		body: string
		section: string
		datetime: string
		summary: string | null
		imageUrl: string | null
		published: boolean
	}
}

export default function PostForm({ initialData }: Props) {
	const router = useRouter()
	const isEditing = initialData != null

	const [title, setTitle] = useState(initialData?.title ?? "")
	const [section, setSection] = useState(initialData?.section ?? "tech")
	const [datetime, setDatetime] = useState(
		initialData?.datetime ?? currentDatetimeString()
	)
	const [published, setPublished] = useState(initialData?.published ?? true)
	const [summary, setSummary] = useState(initialData?.summary ?? "")
	const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "")
	const [body, setBody] = useState(initialData?.body ?? "")
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [isDeleting, setIsDeleting] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setIsSubmitting(true)

		try {
			const payload = {
				title,
				body,
				section,
				datetime,
				published,
				summary: summary || undefined,
				imageUrl: imageUrl || undefined,
			}

			const url = isEditing
				? `/api/admin/posts/${initialData.id}`
				: "/api/admin/posts"
			const method = isEditing ? "PUT" : "POST"

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Something went wrong. Please try again.")
			}

			router.push("/admin")
		} catch (err) {
			setError(
				err instanceof Error
					? err.message
					: "Something went wrong. Please try again."
			)
		} finally {
			setIsSubmitting(false)
		}
	}

	async function handleDelete() {
		if (!isEditing) {
			return
		}

		if (
			!confirm(
				"Are you sure you want to delete this post? This cannot be undone."
			)
		) {
			return
		}

		setError(null)
		setIsDeleting(true)

		try {
			const response = await fetch(`/api/admin/posts/${initialData.id}`, {
				method: "DELETE",
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Delete failed. Please try again.")
			}

			router.push("/admin")
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Delete failed. Please try again."
			)
		} finally {
			setIsDeleting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<label htmlFor="title" className="text-secondary text-sm font-medium">
					Title
				</label>
				<input
					id="title"
					type="text"
					required
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="section" className="text-secondary text-sm font-medium">
					Section
				</label>
				<select
					id="section"
					value={section}
					onChange={(e) => setSection(e.target.value)}
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
				>
					{SECTIONS.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="datetime"
					className="text-secondary text-sm font-medium"
				>
					Datetime
				</label>
				<input
					id="datetime"
					type="text"
					value={datetime}
					onChange={(e) => setDatetime(e.target.value)}
					placeholder="yyyy-MM-dd-HHmm"
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 font-mono text-sm transition-colors outline-none"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Published</label>
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={published}
						onChange={(e) => setPublished(e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-primary text-sm">
						{published ? "Published" : "Draft"}
					</span>
				</label>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="summary" className="text-secondary text-sm font-medium">
					Summary
				</label>
				<textarea
					id="summary"
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					rows={3}
					placeholder="Optional summary shown in post listings…"
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
				/>
			</div>

			<ImageUpload value={imageUrl} onChange={setImageUrl} label="Image" />

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Body</label>
				<MarkdownEditor
					value={body}
					onChange={setBody}
					placeholder="Write your post in markdown…"
				/>
			</div>

			{error && <p className="text-sm text-red-500">{error}</p>}

			<div className="flex items-center justify-between">
				<button
					type="submit"
					disabled={isSubmitting || isDeleting}
					className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? "Saving…" : "Save post"}
				</button>

				{isEditing && (
					<button
						type="button"
						onClick={handleDelete}
						disabled={isDeleting || isSubmitting}
						className="text-sm text-red-500 transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isDeleting ? "Deleting…" : "Delete"}
					</button>
				)}
			</div>
		</form>
	)
}
