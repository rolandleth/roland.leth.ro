"use client"

import { useCallback, useState } from "react"
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

interface FormState {
	title: string
	section: string
	datetime: string
	published: boolean
	summary: string
	imageUrl: string
	body: string
}

export default function PostForm({ initialData }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } = useAdminResource<PostPayload>({
		resource: "posts",
		id: initialData?.id ?? null,
	})

	// Single state object so a partial-update setter (`setField`) can stand in
	// for the seven individual `useState` setters this form used to carry. The
	// callback identity is stable across renders (no value/closure dependency)
	// so the heavy children — `MarkdownEditor`, `ImageUpload` — get the same
	// `onChange` reference on every render.
	const [state, setState] = useState<FormState>({
		title: initialData?.title ?? "",
		section: initialData?.section ?? "tech",
		datetime: initialData?.datetime ?? currentDatetimeString(),
		published: initialData?.published ?? true,
		summary: initialData?.summary ?? "",
		imageUrl: initialData?.imageUrl ?? "",
		body: initialData?.body ?? "",
	})

	const setField = useCallback(
		<K extends keyof FormState>(field: K, value: FormState[K]) => {
			setState((prev) => ({ ...prev, [field]: value }))
		},
		[]
	)

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()

		await save({
			title: state.title,
			body: state.body,
			section: state.section,
			datetime: state.datetime,
			published: state.published,
			summary: state.summary || undefined,
			imageUrl: state.imageUrl || undefined,
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
					value={state.title}
					onChange={(e) => setField("title", e.target.value)}
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="section" className="text-secondary text-sm font-medium">
					Section
				</label>
				<select
					id="section"
					value={state.section}
					onChange={(e) => setField("section", e.target.value)}
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
					value={state.datetime}
					onChange={(e) => setField("datetime", e.target.value)}
					placeholder="yyyy-MM-dd-HHmm"
					className="admin-input font-mono"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Published</label>
				<label className="flex items-center gap-2">
					<input
						type="checkbox"
						checked={state.published}
						onChange={(e) => setField("published", e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-primary text-sm">
						{state.published ? "Published" : "Draft"}
					</span>
				</label>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="summary" className="text-secondary text-sm font-medium">
					Summary
				</label>
				<textarea
					id="summary"
					value={state.summary}
					onChange={(e) => setField("summary", e.target.value)}
					rows={3}
					placeholder="Optional summary shown in post listings…"
					className="admin-input"
				/>
			</div>

			<ImageUpload
				value={state.imageUrl}
				onChange={(v) => setField("imageUrl", v)}
				label="Image"
			/>

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Body</label>
				<MarkdownEditor
					value={state.body}
					onChange={(v) => setField("body", v)}
					placeholder="Write your post in markdown…"
				/>
			</div>

			{error && (
				<p className="text-sm text-red-500" role="alert">
					{error}
				</p>
			)}

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
