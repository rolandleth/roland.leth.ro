"use client"

import { useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import ReorderControls from "@/components/ui/ReorderControls"
import { moveAndReorder } from "@/lib/reorder"

export interface SectionImage {
	url: string
	caption: string
	sortOrder: number
}

export interface SectionItem {
	_key: string
	title: string
	description: string
	sortOrder: number
	images: SectionImage[]
}

interface Props {
	value: SectionItem[]
	onChange: (sections: SectionItem[]) => void
}

function SectionCard({
	section,
	index,
	total,
	onUpdate,
	onRemove,
	onMove,
}: {
	section: SectionItem
	index: number
	total: number
	onUpdate: (updated: SectionItem) => void
	onRemove: () => void
	onMove: (direction: "up" | "down") => void
}) {
	const [isOpen, setIsOpen] = useState(true)

	function updateField(
		field: keyof Omit<SectionItem, "images" | "sortOrder">,
		value: string
	) {
		onUpdate({ ...section, [field]: value })
	}

	function addImage() {
		const images = [
			...section.images,
			{ url: "", caption: "", sortOrder: section.images.length },
		]
		onUpdate({ ...section, images })
	}

	function removeImage(imageIndex: number) {
		const images = section.images
			.filter((_, i) => i !== imageIndex)
			.map((img, i) => ({ ...img, sortOrder: i }))
		onUpdate({ ...section, images })
	}

	function updateImage(
		imageIndex: number,
		field: keyof Omit<SectionImage, "sortOrder">,
		value: string
	) {
		const images = section.images.map((img, i) =>
			i === imageIndex ? { ...img, [field]: value } : img
		)
		onUpdate({ ...section, images })
	}

	function moveImage(imageIndex: number, direction: "up" | "down") {
		onUpdate({
			...section,
			images: moveAndReorder(section.images, imageIndex, direction),
		})
	}

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
					onChange={(e) => updateField("title", e.target.value)}
					placeholder="Section title"
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

			{isOpen && (
				<div className="border-border flex flex-col gap-6 border-t p-4">
					<div className="flex flex-col gap-1.5">
						<label className="text-secondary text-sm font-medium">
							Description
						</label>
						<MarkdownEditor
							value={section.description}
							onChange={(v) => updateField("description", v)}
							placeholder="Section description…"
						/>
					</div>

					<div className="flex flex-col gap-3">
						<label className="text-secondary text-sm font-medium">Images</label>

						{section.images.map((image, imageIndex) => (
							<div
								key={imageIndex}
								className="border-border flex flex-col gap-3 rounded-md border p-3"
							>
								<ImageUpload
									value={image.url}
									onChange={(url) => updateImage(imageIndex, "url", url)}
									label="Image URL"
								/>

								<div className="flex items-center gap-2">
									<input
										type="text"
										value={image.caption}
										onChange={(e) =>
											updateImage(imageIndex, "caption", e.target.value)
										}
										placeholder="Caption (optional)"
										className="admin-input min-w-0 flex-1"
									/>

									<ReorderControls
										canMoveUp={imageIndex > 0}
										canMoveDown={imageIndex < section.images.length - 1}
										onMoveUp={() => moveImage(imageIndex, "up")}
										onMoveDown={() => moveImage(imageIndex, "down")}
										onRemove={() => removeImage(imageIndex)}
									/>
								</div>
							</div>
						))}

						<button
							type="button"
							onClick={addImage}
							className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
						>
							Add image
						</button>
					</div>
				</div>
			)}
		</div>
	)
}

export default function SectionManager({ value, onChange }: Props) {
	function addSection() {
		onChange([
			...value,
			{
				_key: crypto.randomUUID(),
				title: "",
				description: "",
				sortOrder: value.length,
				images: [],
			},
		])
	}

	function updateSection(index: number, updated: SectionItem) {
		onChange(value.map((s, i) => (i === index ? updated : s)))
	}

	function removeSection(index: number) {
		const updated = value
			.filter((_, i) => i !== index)
			.map((s, i) => ({ ...s, sortOrder: i }))
		onChange(updated)
	}

	function moveSection(index: number, direction: "up" | "down") {
		onChange(moveAndReorder(value, index, direction))
	}

	return (
		<div className="flex flex-col gap-3">
			{value.map((section, index) => (
				<SectionCard
					key={section._key}
					section={section}
					index={index}
					total={value.length}
					onUpdate={(updated) => updateSection(index, updated)}
					onRemove={() => removeSection(index)}
					onMove={(direction) => moveSection(index, direction)}
				/>
			))}

			<button
				type="button"
				onClick={addSection}
				className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
			>
				Add section
			</button>
		</div>
	)
}
