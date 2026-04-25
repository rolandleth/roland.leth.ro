"use client"

import { useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { useOrderedList } from "@/components/admin/useOrderedList"
import ReorderControls from "@/components/ui/ReorderControls"

export interface SectionImage {
	_key: string
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
	onPatch,
	onRemove,
	onMove,
}: {
	section: SectionItem
	index: number
	total: number
	onPatch: (patch: Partial<SectionItem>) => void
	onRemove: () => void
	onMove: (direction: "up" | "down") => void
}) {
	const [isOpen, setIsOpen] = useState(true)

	const images = useOrderedList<SectionImage>(section.images, (next) =>
		onPatch({ images: next })
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
							onChange={(v) => onPatch({ description: v })}
							placeholder="Section description…"
						/>
					</div>

					<div className="flex flex-col gap-3">
						<label className="text-secondary text-sm font-medium">Images</label>

						{section.images.map((image, imageIndex) => (
							<div
								key={image._key}
								className="border-border flex flex-col gap-3 rounded-md border p-3"
							>
								<ImageUpload
									value={image.url}
									onChange={(url) => images.update(imageIndex, { url })}
									label="Image URL"
								/>

								<div className="flex items-center gap-2">
									<input
										type="text"
										value={image.caption}
										onChange={(e) =>
											images.update(imageIndex, { caption: e.target.value })
										}
										placeholder="Caption (optional)"
										className="admin-input min-w-0 flex-1"
									/>

									<ReorderControls
										canMoveUp={imageIndex > 0}
										canMoveDown={imageIndex < section.images.length - 1}
										onMoveUp={() => images.move(imageIndex, "up")}
										onMoveDown={() => images.move(imageIndex, "down")}
										onRemove={() => images.remove(imageIndex)}
									/>
								</div>
							</div>
						))}

						<button
							type="button"
							onClick={() => images.add(() => ({ url: "", caption: "" }))}
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
	const list = useOrderedList<SectionItem>(value, onChange)

	return (
		<div className="flex flex-col gap-3">
			{value.map((section, index) => (
				<SectionCard
					key={section._key}
					section={section}
					index={index}
					total={value.length}
					onPatch={(patch) => list.update(index, patch)}
					onRemove={() => list.remove(index)}
					onMove={(direction) => list.move(index, direction)}
				/>
			))}

			<button
				type="button"
				onClick={() =>
					list.add(() => ({ title: "", description: "", images: [] }))
				}
				className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
			>
				Add section
			</button>
		</div>
	)
}
