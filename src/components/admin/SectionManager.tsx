"use client"

import { useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import {
	type OrderedItemPatch,
	type OrderedListChange,
	useOrderedList,
} from "@/components/admin/useOrderedList"
import ReorderControls from "@/components/ui/ReorderControls"
import {
	ProjectSectionKind,
	ProjectSectionLayout,
} from "@/generated/prisma/enums"

export interface SectionImage {
	_key: string
	url: string
	caption: string
	/** Empty means none: the page falls back to the caption, then the section title. */
	alt: string
	sortOrder: number
}

/**
 * A step of a `steps` section, as loaded. The form doesn't edit steps yet (the
 * manifest does); it carries them through a save untouched.
 */
export interface SectionStep {
	title: string
	description: string
	sortOrder: number
	images: {
		url: string
		caption: string | null
		alt: string | null
		sortOrder: number
	}[]
}

export interface SectionItem {
	_key: string
	title: string
	description: string
	sortOrder: number
	/** What the section holds on the own-app page (`ProjectSectionKind`). */
	kind: ProjectSectionKind
	/** Set for `text` sections, null for the other kinds. */
	layout: ProjectSectionLayout | null
	images: SectionImage[]
	items: SectionStep[]
}

const KIND_OPTIONS: { value: ProjectSectionKind; label: string }[] = [
	{ value: ProjectSectionKind.text, label: "Text" },
	{ value: ProjectSectionKind.steps, label: "Steps" },
	{ value: ProjectSectionKind.pricing, label: "Pricing" },
]

const LAYOUT_OPTIONS: { value: ProjectSectionLayout; label: string }[] = [
	{
		value: ProjectSectionLayout.stacked,
		label: "Stacked: title, images, text",
	},
	{ value: ProjectSectionLayout.split, label: "Split: title left, text right" },
]

const DESCRIPTION_LABELS: Record<ProjectSectionKind, string> = {
	text: "Description",
	steps: "Intro above the steps (optional)",
	pricing: "Note under the plan cards (optional)",
}

/**
 * The patch for a kind change: a `text` section needs a layout (stacked unless
 * it had one), the other kinds have none.
 */
function kindPatch(
	section: SectionItem,
	kind: ProjectSectionKind
): OrderedItemPatch<SectionItem> {
	if (kind === ProjectSectionKind.text) {
		return { kind, layout: section.layout ?? ProjectSectionLayout.stacked }
	}

	return { kind, layout: null }
}

interface Props {
	value: SectionItem[]
	onChange: OrderedListChange<SectionItem>
	/**
	 * Reports each image upload starting and ending, keyed by the image's
	 * `_key`, so the form can hold Save until every upload has landed.
	 */
	onUploadingChange?: (imageKey: string, isUploading: boolean) => void
}

type SectionPatch =
	| OrderedItemPatch<SectionItem>
	| ((section: SectionItem) => OrderedItemPatch<SectionItem>)

function SectionCard({
	section,
	index,
	total,
	onPatch,
	onRemove,
	onMove,
	onUploadingChange,
}: {
	section: SectionItem
	index: number
	total: number
	onPatch: (patch: SectionPatch) => void
	onRemove: () => void
	onMove: (direction: "up" | "down") => void
	onUploadingChange?: (imageKey: string, isUploading: boolean) => void
}) {
	const [isOpen, setIsOpen] = useState(true)

	// The image list patches its section from the section's latest images, so
	// an upload finishing after other edits adds its URL to them instead of
	// restoring the images as they were when the file was picked.
	const images = useOrderedList<SectionImage>((update) =>
		onPatch((latest) => ({ images: update(latest.images) }))
	)

	return (
		<div className="border-border rounded-lg border">
			<div className="flex items-center gap-2 p-3">
				<button
					type="button"
					onClick={() => setIsOpen((prev) => !prev)}
					className="text-secondary hover:text-primary shrink-0 text-sm transition-colors"
					aria-label={isOpen ? "Collapse section" : "Expand section"}
				>
					{isOpen ? "▾" : "▸"}
				</button>

				<input
					type="text"
					value={section.title}
					onChange={(e) => onPatch({ title: e.target.value })}
					placeholder="Section title"
					aria-label="Section title"
					className="admin-input min-w-0 flex-1 py-1.5"
				/>

				<ReorderControls
					canMoveUp={index > 0}
					canMoveDown={index < total - 1}
					onMoveUp={() => onMove("up")}
					onMoveDown={() => onMove("down")}
					onRemove={onRemove}
				/>
			</div>

			{/* Hidden, not unmounted: unmounting an `ImageUpload` aborts its upload,
			    so collapsing a section mid-upload would drop the picked image
			    without a word. Tailwind's preflight makes `[hidden]` beat `flex`. */}
			<div
				hidden={!isOpen}
				className="border-border flex flex-col gap-6 border-t p-4"
			>
				{/* Read by the own-app layout only. The API enforces the rules (one
				    pricing section, steps need two or more), so the author learns
				    them on save. */}
				<div className="flex flex-wrap gap-4">
					<label className="flex flex-col gap-1.5">
						<span className="text-secondary text-sm font-medium">Kind</span>
						<select
							value={section.kind}
							onChange={(e) =>
								onPatch((latest) =>
									kindPatch(latest, e.target.value as ProjectSectionKind)
								)
							}
							className="admin-input"
						>
							{KIND_OPTIONS.map(({ value, label }) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
					</label>

					{section.kind === ProjectSectionKind.text && (
						<label className="flex flex-col gap-1.5">
							<span className="text-secondary text-sm font-medium">Layout</span>
							<select
								value={section.layout ?? ProjectSectionLayout.stacked}
								onChange={(e) =>
									onPatch({ layout: e.target.value as ProjectSectionLayout })
								}
								className="admin-input"
							>
								{LAYOUT_OPTIONS.map(({ value, label }) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
						</label>
					)}
				</div>

				{section.kind === ProjectSectionKind.steps && (
					<p className="text-secondary text-sm">
						{section.items.length === 0
							? "No steps yet. Steps are written in the project manifest, and a steps section needs at least 2."
							: `${section.items.length} steps, edited in the project manifest. Saving here keeps them as they are.`}
					</p>
				)}

				<div className="flex flex-col gap-1.5">
					<span className="text-secondary text-sm font-medium">
						{DESCRIPTION_LABELS[section.kind]}
					</span>
					<MarkdownEditor
						value={section.description}
						onChange={(v) => onPatch({ description: v })}
						placeholder="Section description…"
					/>
				</div>

				{/* Only text sections take images. A section switched to another
				    kind keeps showing the ones it has, so they can be removed; the
				    API rejects them on save rather than dropping them unseen. */}
				{(section.kind === ProjectSectionKind.text ||
					section.images.length > 0) && (
					<div className="flex flex-col gap-3">
						<span className="text-secondary text-sm font-medium">Images</span>

						{section.images.map((image, imageIndex) => (
							<div
								key={image._key}
								className="border-border flex flex-col gap-3 rounded-md border p-3"
							>
								<ImageUpload
									value={image.url}
									onChange={(url) => images.update(image._key, { url })}
									label="Image URL"
									onUploadingChange={(isUploading) =>
										onUploadingChange?.(image._key, isUploading)
									}
								/>

								<div className="flex items-center gap-2">
									<input
										type="text"
										value={image.caption}
										onChange={(e) =>
											images.update(image._key, { caption: e.target.value })
										}
										placeholder="Caption (optional)"
										className="admin-input min-w-0 flex-1"
									/>

									<ReorderControls
										canMoveUp={imageIndex > 0}
										canMoveDown={imageIndex < section.images.length - 1}
										onMoveUp={() => images.move(image._key, "up")}
										onMoveDown={() => images.move(image._key, "down")}
										onRemove={() => images.remove(image._key)}
									/>
								</div>

								<input
									type="text"
									value={image.alt}
									onChange={(e) =>
										images.update(image._key, { alt: e.target.value })
									}
									placeholder="Alt text (optional, defaults to the caption)"
									aria-label="Alt text"
									maxLength={300}
									className="admin-input"
								/>
							</div>
						))}

						<button
							type="button"
							onClick={() =>
								images.add(() => ({ url: "", caption: "", alt: "" }))
							}
							className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
						>
							Add image
						</button>
					</div>
				)}
			</div>
		</div>
	)
}

export default function SectionManager({
	value,
	onChange,
	onUploadingChange,
}: Props) {
	const list = useOrderedList<SectionItem>(onChange)

	return (
		<div className="flex flex-col gap-3">
			{value.map((section, index) => (
				<SectionCard
					key={section._key}
					section={section}
					index={index}
					total={value.length}
					onPatch={(patch) => list.update(section._key, patch)}
					onRemove={() => list.remove(section._key)}
					onMove={(direction) => list.move(section._key, direction)}
					onUploadingChange={onUploadingChange}
				/>
			))}

			<button
				type="button"
				onClick={() =>
					list.add(() => ({
						title: "",
						description: "",
						kind: ProjectSectionKind.text,
						layout: ProjectSectionLayout.stacked,
						images: [],
						items: [],
					}))
				}
				className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
			>
				Add section
			</button>
		</div>
	)
}
