"use client"

import { useOrderedList } from "@/components/admin/useOrderedList"
import PresetOrFreeformInput from "@/components/ui/PresetOrFreeformInput"
import ReorderControls from "@/components/ui/ReorderControls"

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
	const list = useOrderedList(value, onChange)

	return (
		<div className="flex flex-col gap-3">
			{value.map((link, index) => (
				<LinkRow
					key={link._key}
					link={link}
					index={index}
					total={value.length}
					onLabelChange={(label) => list.update(index, { label })}
					onUrlChange={(url) => list.update(index, { url })}
					onMoveUp={() => list.move(index, "up")}
					onMoveDown={() => list.move(index, "down")}
					onRemove={() => list.remove(index)}
				/>
			))}

			<button
				type="button"
				onClick={() => list.add(() => ({ label: "", url: "" }))}
				className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
			>
				Add link
			</button>
		</div>
	)
}
