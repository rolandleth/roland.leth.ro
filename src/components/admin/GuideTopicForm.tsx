"use client"

import { useCallback, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { useAdminResource } from "@/components/admin/useAdminResource"
import type { GuideFormProjectOption } from "@/components/admin/GuideForm"

interface Props {
	initialData?: {
		id: number
		slug: string
		title: string
		shortDescription: string
		description: string
		projectSlug: string | null
		published: boolean
	}
	projects: GuideFormProjectOption[]
	/** Guides in this topic; drives the delete warning, since the FK is `Restrict`. */
	guideCount?: number
}

interface GuideTopicPayload {
	slug: string
	title: string
	shortDescription: string
	description: string
	projectSlug: string | null
	published: boolean
}

interface FormState {
	slug: string
	title: string
	shortDescription: string
	description: string
	projectSlug: string
	published: boolean
}

const NONE = "none"

export default function GuideTopicForm({
	initialData,
	projects,
	guideCount = 0,
}: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } =
		useAdminResource<GuideTopicPayload>({
			resource: "guide-topics",
			id: initialData?.id ?? null,
		})

	const [state, setState] = useState<FormState>({
		slug: initialData?.slug ?? "",
		title: initialData?.title ?? "",
		shortDescription: initialData?.shortDescription ?? "",
		description: initialData?.description ?? "",
		projectSlug: initialData?.projectSlug ?? NONE,
		published: initialData?.published ?? true,
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
			slug: state.slug,
			title: state.title,
			shortDescription: state.shortDescription,
			description: state.description,
			projectSlug: state.projectSlug === NONE ? null : state.projectSlug,
			published: state.published,
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
				<label htmlFor="slug" className="text-secondary text-sm font-medium">
					Slug
				</label>
				<input
					id="slug"
					type="text"
					required
					value={state.slug}
					onChange={(e) => setField("slug", e.target.value)}
					placeholder="making-better-decisions"
					className="admin-input font-mono"
				/>
				<p className="text-secondary text-xs">
					Shares one namespace with guide slugs. Permanent once shared.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="shortDescription"
					className="text-secondary text-sm font-medium"
				>
					Short description
				</label>
				<textarea
					id="shortDescription"
					required
					maxLength={300}
					value={state.shortDescription}
					onChange={(e) => setField("shortDescription", e.target.value)}
					rows={2}
					placeholder="The one-line blurb shown on the project page and the guides index."
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="projectSlug"
					className="text-secondary text-sm font-medium"
				>
					Project
				</label>
				<select
					id="projectSlug"
					value={state.projectSlug}
					onChange={(e) => setField("projectSlug", e.target.value)}
					className="admin-input"
				>
					<option value={NONE}>No project</option>
					{projects.map((project) => (
						<option key={project.slug} value={project.slug}>
							{project.name}
						</option>
					))}
				</select>
				{guideCount > 0 && (
					<p className="text-secondary text-xs">
						Changing this moves all {guideCount} guide
						{guideCount === 1 ? "" : "s"} in this topic to the new project too.
					</p>
				)}
			</div>

			<div className="flex flex-col gap-1.5">
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
				{/* Worth saying plainly: unpublishing a hub is not a way to hide its
				    guides, and an admin assuming otherwise would be surprised. */}
				<p className="text-secondary text-xs">
					Unpublishing hides this hub and its grouping. Its guides stay live and
					listed on their own.
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">Hub body</span>
				<MarkdownEditor
					value={state.description}
					onChange={(v) => setField("description", v)}
					placeholder="The hub's landing-page body, in markdown. No H1."
				/>
			</div>

			{error && <ErrorMessage>{error}</ErrorMessage>}

			<div className="flex items-center justify-between">
				<button
					type="submit"
					disabled={isSubmitting}
					className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? "Saving…" : "Save topic"}
				</button>

				{isEditing && (
					<button
						type="button"
						onClick={remove}
						disabled={isSubmitting || guideCount > 0}
						title={
							guideCount > 0
								? "Move or delete this topic's guides first."
								: undefined
						}
						className="text-sm text-red-500 transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Delete
					</button>
				)}
			</div>
		</form>
	)
}
