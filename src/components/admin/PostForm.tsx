"use client"

import { useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { useAdminResource } from "@/components/admin/useAdminResource"
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

interface PostPayload {
	title: string
	body: string
	section: string
	datetime: string
	published: boolean
	summary?: string
	imageUrl?: string
}

export default function PostForm({ initialData }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } = useAdminResource<PostPayload>({
		resource: "posts",
		id: initialData?.id ?? null,
	})

	const [title, setTitle] = useState(initialData?.title ?? "")
	const [section, setSection] = useState(initialData?.section ?? "tech")
	const [datetime, setDatetime] = useState(
		initialData?.datetime ?? currentDatetimeString()
	)
	const [published, setPublished] = useState(initialData?.published ?? true)
	const [summary, setSummary] = useState(initialData?.summary ?? "")
	const [imageUrl, setImageUrl] = useState(initialData?.imageUrl ?? "")
	const [body, setBody] = useState(initialData?.body ?? "")

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()

		await save({
			title,
			body,
			section,
			datetime,
			published,
			summary: summary || undefined,
			imageUrl: imageUrl || undefined,
		})
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
					className="admin-input"
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
					className="admin-input"
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
					className="admin-input font-mono"
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
					className="admin-input"
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
					disabled={isSubmitting}
					className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? "Saving…" : "Save post"}
				</button>

				{isEditing && (
					<button
						type="button"
						onClick={remove}
						disabled={isSubmitting}
						className="text-sm text-red-500 transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Delete
					</button>
				)}
			</div>
		</form>
	)
}
