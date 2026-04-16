"use client"

import PresetOrFreeformInput from "@/components/ui/PresetOrFreeformInput"
import ReorderControls from "@/components/ui/ReorderControls"
import { moveAndReorder } from "@/lib/reorder"

const LINK_LABEL_OPTIONS = [
	"GitHub",
	"App Store",
	"TestFlight",
	"Google Play",
	"Website",
	"Demo",
	"Documentation",
	"Product Hunt",
]

export interface LinkItem {
	_key: string
	label: string
	url: string
	sortOrder: number
}

interface LinkRowProps {
	link: LinkItem
	index: number
	total: number
	onLabelChange: (value: string) => void
	onUrlChange: (value: string) => void
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
}

function LinkRow({
	link,
	index,
	total,
	onLabelChange,
	onUrlChange,
	onMoveUp,
	onMoveDown,
	onRemove,
}: LinkRowProps) {
	return (
		<div className="flex items-center gap-2">
			<PresetOrFreeformInput
				value={link.label}
				onChange={onLabelChange}
				presets={LINK_LABEL_OPTIONS}
				presetLabel="Select a label…"
				className="min-w-0 flex-1"
			/>
			<input
				type="text"
				value={link.url}
				onChange={(e) => onUrlChange(e.target.value)}
				placeholder="https://..."
				className="admin-input min-w-0 flex-1"
			/>

			<ReorderControls
				canMoveUp={index > 0}
				canMoveDown={index < total - 1}
				onMoveUp={onMoveUp}
				onMoveDown={onMoveDown}
				onRemove={onRemove}
			/>
		</div>
	)
}

interface Props {
	value: LinkItem[]
	onChange: (links: LinkItem[]) => void
}

export default function LinkManager({ value, onChange }: Props) {
	function addLink() {
		onChange([
			...value,
			{
				_key: crypto.randomUUID(),
				label: "",
				url: "",
				sortOrder: value.length,
			},
		])
	}

	function removeLink(index: number) {
		const updated = value
			.filter((_, i) => i !== index)
			.map((link, i) => ({ ...link, sortOrder: i }))
		onChange(updated)
	}

	function updateLink(
		index: number,
		field: keyof Omit<LinkItem, "sortOrder" | "_key">,
		newValue: string
	) {
		const updated = value.map((link, i) =>
			i === index ? { ...link, [field]: newValue } : link
		)
		onChange(updated)
	}

	function moveLink(index: number, direction: "up" | "down") {
		onChange(moveAndReorder(value, index, direction))
	}

	return (
		<div className="flex flex-col gap-3">
			{value.map((link, index) => (
				<LinkRow
					key={link._key}
					link={link}
					index={index}
					total={value.length}
					onLabelChange={(v) => updateLink(index, "label", v)}
					onUrlChange={(v) => updateLink(index, "url", v)}
					onMoveUp={() => moveLink(index, "up")}
					onMoveDown={() => moveLink(index, "down")}
					onRemove={() => removeLink(index)}
				/>
			))}

			<button
				type="button"
				onClick={addLink}
				className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
			>
				Add link
			</button>
		</div>
	)
}
