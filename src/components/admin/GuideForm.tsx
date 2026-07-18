"use client"

import { useCallback } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import {
	type GuideFormProjectOption,
	type GuideFormTopicOption,
	NONE,
} from "@/components/admin/guideFormOptions"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { useAdminResource } from "@/components/admin/useAdminResource"
import { useFormState } from "@/components/admin/useFormState"

interface Props {
	initialData?: {
		id: number
		slug: string
		title: string
		description: string
		body: string
		projectSlug: string | null
		topicId: number | null
		sortOrder: number
		published: boolean
	}
	topics: GuideFormTopicOption[]
	projects: GuideFormProjectOption[]
}

interface GuidePayload {
	slug: string
	title: string
	description: string
	body: string
	projectSlug: string | null
	topicId: number | null
	sortOrder: number
	published: boolean
}

interface FormState {
	slug: string
	title: string
	description: string
	body: string
	projectSlug: string
	topicId: string
	sortOrder: string
	published: boolean
}

export default function GuideForm({ initialData, topics, projects }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } = useAdminResource<GuidePayload>({
		resource: "guides",
		id: initialData?.id ?? null,
	})

	const { state, setField, setState } = useFormState<FormState>({
		slug: initialData?.slug ?? "",
		title: initialData?.title ?? "",
		description: initialData?.description ?? "",
		body: initialData?.body ?? "",
		projectSlug: initialData?.projectSlug ?? NONE,
		topicId: initialData?.topicId != null ? String(initialData.topicId) : NONE,
		sortOrder: String(initialData?.sortOrder ?? 0),
		published: initialData?.published ?? true,
	})

	/**
	 * Picking a topic adopts its project: the API rejects a guide whose project
	 * disagrees with its topic's, so letting the two drift in the form would only
	 * produce a 400 on save. Clearing the topic leaves the project alone.
	 */
	const selectTopic = useCallback(
		(value: string) => {
			const topic = topics.find((t) => String(t.id) === value)

			setState((prev) => ({
				...prev,
				topicId: value,
				projectSlug:
					topic == null ? prev.projectSlug : (topic.projectSlug ?? NONE),
			}))
		},
		// `setState` is the stable setter from `useFormState`; listed to satisfy
		// exhaustive-deps now that it comes from a custom hook.
		[topics, setState]
	)

	const isProjectLocked = state.topicId !== NONE

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()

		await save({
			slug: state.slug,
			title: state.title,
			description: state.description,
			body: state.body,
			projectSlug: state.projectSlug === NONE ? null : state.projectSlug,
			topicId: state.topicId === NONE ? null : Number(state.topicId),
			// Non-numeric input can't reach here — the field is `type="number"` and
			// the schema rejects a non-integer — so a stray parse falls back to 0
			// rather than shipping NaN.
			sortOrder: Number.parseInt(state.sortOrder, 10) || 0,
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
					placeholder="how-to-keep-a-decision-journal"
					className="admin-input font-mono"
				/>
				{/* Not derived from the title, unlike a post's: a guide's slug is
				    phrased to match the search query it targets, and it's permanent
				    the moment it's indexed or shared. */}
				<p className="text-secondary text-xs">
					Permanent once shared or indexed. Phrase it like the search query.
				</p>
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
					required
					maxLength={160}
					value={state.description}
					onChange={(e) => setField("description", e.target.value)}
					rows={3}
					placeholder="150–160 characters. Meta description, OG description, and preview text."
					className="admin-input"
				/>
				<p className="text-secondary text-xs">{state.description.length}/160</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="topicId" className="text-secondary text-sm font-medium">
					Topic
				</label>
				<select
					id="topicId"
					value={state.topicId}
					onChange={(e) => selectTopic(e.target.value)}
					className="admin-input"
				>
					<option value={NONE}>No topic (standalone)</option>
					{topics.map((topic) => (
						<option key={topic.id} value={String(topic.id)}>
							{topic.title}
						</option>
					))}
				</select>
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
					disabled={isProjectLocked}
					onChange={(e) => setField("projectSlug", e.target.value)}
					aria-describedby="projectSlug-help"
					className="admin-input disabled:opacity-50"
				>
					<option value={NONE}>No project</option>
					{projects.map((project) => (
						<option key={project.slug} value={project.slug}>
							{project.name}
						</option>
					))}
				</select>
				<p id="projectSlug-help" className="text-secondary text-xs">
					{isProjectLocked
						? "Set by the topic. Clear the topic to choose a different project."
						: "No project means no product link, and it won't be listed on any project page."}
				</p>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="sortOrder"
					className="text-secondary text-sm font-medium"
				>
					Sort order
				</label>
				<input
					id="sortOrder"
					type="number"
					min={0}
					step={1}
					value={state.sortOrder}
					onChange={(e) => setField("sortOrder", e.target.value)}
					className="admin-input"
				/>
				<p className="text-secondary text-xs">Position within its topic.</p>
			</div>

			<div className="flex flex-col gap-1.5">
				{/* Section heading, not a control label — the inner `<label>` wraps
				    and toggles the checkbox. */}
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
				{/* `MarkdownEditor` is a composite (toolbar + textarea + preview), so
				    there's no single element to bind via `htmlFor`. */}
				<span className="text-secondary text-sm font-medium">Body</span>
				<MarkdownEditor
					value={state.body}
					onChange={(v) => setField("body", v)}
					placeholder="Write the guide in markdown. No H1 — the page renders the title."
				/>
			</div>

			{error && <ErrorMessage>{error}</ErrorMessage>}

			<div className="flex items-center justify-between">
				<button
					type="submit"
					disabled={isSubmitting}
					className="admin-submit-btn"
				>
					{isSubmitting ? "Saving…" : "Save guide"}
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
