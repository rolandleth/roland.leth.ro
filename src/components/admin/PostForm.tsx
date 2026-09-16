"use client"

import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import ImageUpload from "@/components/admin/ImageUpload"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { useAdminResource } from "@/components/admin/useAdminResource"
import { useFormState } from "@/components/admin/useFormState"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
import { SECTIONS } from "@/lib/db/sections"
import { currentDatetimeString } from "@/lib/utils/format"

interface Props {
	initialData?: {
		id: number
		title: string
		body: string
		section: string
		datetime: string
		description: string
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
	/**
	 * Always sent, never omitted: the edit route reads an absent key as "leave the
	 * column" and `""` as "cleared, derive one". Required here so the type carries
	 * that contract rather than the comment at the send alone.
	 */
	description: string
	imageUrl: string | null
}

interface FormState {
	title: string
	section: string
	datetime: string
	published: boolean
	description: string
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
	const { state, setField } = useFormState<FormState>({
		title: initialData?.title ?? "",
		section: initialData?.section ?? "tech",
		datetime: initialData?.datetime ?? currentDatetimeString(),
		published: initialData?.published ?? true,
		description: initialData?.description ?? "",
		imageUrl: initialData?.imageUrl ?? "",
		body: initialData?.body ?? "",
	})
	// Saving mid-upload would persist the row without the image and navigate
	// away, aborting the request — the picked file lost with nothing shown.
	const [isUploading, setIsUploading] = useState(false)

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()

		await save({
			title: state.title,
			body: state.body,
			section: state.section,
			datetime: state.datetime,
			published: state.published,
			// Sent as typed, `""` included: an emptied field is how the edit route
			// tells "cleared, derive one" apart from a request that doesn't touch
			// the description. Omitting it would keep the old value.
			description: state.description,
			// `null`, not `undefined`, for an empty field: the edit route skips an
			// omitted key, so an image removed in the form would stay on the post.
			// (`""` isn't an option — the schema only accepts an http(s) URL or null.)
			imageUrl: state.imageUrl || null,
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
				{/* Section heading, not a form control label — the inner `<label>`
					below wraps and toggles the checkbox. Rendered as a `<span>` so
					clicking it doesn't appear to be tied to a control and assistive
					tech doesn't announce it as an empty label. */}
				<span className="text-secondary text-sm font-medium">Published</span>
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
				<label
					htmlFor="description"
					className="text-secondary text-sm font-medium"
				>
					Description
				</label>
				<textarea
					id="description"
					value={state.description}
					onChange={(e) => setField("description", e.target.value)}
					rows={3}
					// The schema's cap. Without it the only feedback is a 400 after a
					// save round-trip, which is also how an over-cap value derived
					// before the cap existed stayed invisible.
					maxLength={DESCRIPTION_MAX_CHARS}
					placeholder="Optional. The meta description for search, social cards and the feed; derived from the body when empty."
					className="admin-input"
				/>
				<span className="text-secondary self-end text-xs">
					{state.description.length}/{DESCRIPTION_MAX_CHARS}
				</span>
			</div>

			<ImageUpload
				value={state.imageUrl}
				onChange={(v) => setField("imageUrl", v)}
				label="Image"
				// `useState`'s setter is identity-stable, so this doesn't re-fire
				// `ImageUpload`'s effect on every render of this form.
				onUploadingChange={setIsUploading}
			/>

			<div className="flex flex-col gap-1.5">
				{/* `MarkdownEditor` is a composite component (toolbar + textarea + preview),
					so there's no single input element to bind via `htmlFor`. Heading
					styled like a label rather than declared as one. */}
				<span className="text-secondary text-sm font-medium">Body</span>
				<MarkdownEditor
					value={state.body}
					onChange={(v) => setField("body", v)}
					placeholder="Write your post in markdown…"
				/>
			</div>

			{error && <ErrorMessage>{error}</ErrorMessage>}

			<div className="flex items-center justify-between">
				<button
					type="submit"
					disabled={isSubmitting || isUploading}
					className="admin-submit-btn"
				>
					{isSubmitting ? "Saving…" : "Save post"}
				</button>

				{isEditing && (
					<button
						type="button"
						onClick={remove}
						disabled={isSubmitting}
						className="admin-delete-btn"
					>
						Delete
					</button>
				)}
			</div>
		</form>
	)
}
