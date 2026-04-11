"use client"

import { useState } from "react"

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

interface LinkItem {
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
	onMove: (direction: "up" | "down") => void
	onRemove: () => void
}

function LinkRow({
	link,
	index,
	total,
	onLabelChange,
	onUrlChange,
	onMove,
	onRemove,
}: LinkRowProps) {
	const isPreset = LINK_LABEL_OPTIONS.includes(link.label)
	const [dropdownLabel, setDropdownLabel] = useState(isPreset ? link.label : "")
	const [freeformLabel, setFreeformLabel] = useState(isPreset ? "" : link.label)

	function handleDropdownChange(value: string) {
		if (value === "__freeform__") {
			setDropdownLabel("")
			onLabelChange(freeformLabel)
		} else {
			setDropdownLabel(value)
			onLabelChange(value)
		}
	}

	function handleFreeformChange(value: string) {
		setFreeformLabel(value)
		onLabelChange(value)
	}

	return (
		<div className="flex items-center gap-2">
			<div className="flex min-w-0 flex-1 gap-2">
				<select
					value={dropdownLabel}
					onChange={(e) => handleDropdownChange(e.target.value)}
					disabled={freeformLabel !== ""}
					required={freeformLabel === ""}
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
				>
					<option value="" disabled>
						Select a label…
					</option>
					{LINK_LABEL_OPTIONS.map((option) => (
						<option key={option} value={option}>
							{option}
						</option>
					))}
					{dropdownLabel !== "" && (
						<option value="__freeform__">Freeform…</option>
					)}
				</select>
				<input
					type="text"
					placeholder="or type freely…"
					value={freeformLabel}
					onChange={(e) => handleFreeformChange(e.target.value)}
					disabled={dropdownLabel !== ""}
					className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
				/>
			</div>
			<input
				type="text"
				value={link.url}
				onChange={(e) => onUrlChange(e.target.value)}
				placeholder="https://..."
				className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none"
			/>

			<div className="flex shrink-0 gap-1">
				<button
					type="button"
					onClick={() => onMove("up")}
					disabled={index === 0}
					className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
					aria-label="Move up"
				>
					↑
				</button>
				<button
					type="button"
					onClick={() => onMove("down")}
					disabled={index === total - 1}
					className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
					aria-label="Move down"
				>
					↓
				</button>
				<button
					type="button"
					onClick={onRemove}
					className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors"
				>
					Remove
				</button>
			</div>
		</div>
	)
}

interface Props {
	value: LinkItem[]
	onChange: (links: LinkItem[]) => void
}

export default function LinkManager({ value, onChange }: Props) {
	function addLink() {
		onChange([...value, { label: "", url: "", sortOrder: value.length }])
	}

	function removeLink(index: number) {
		const updated = value
			.filter((_, i) => i !== index)
			.map((link, i) => ({ ...link, sortOrder: i }))
		onChange(updated)
	}

	function updateLink(
		index: number,
		field: keyof Omit<LinkItem, "sortOrder">,
		newValue: string
	) {
		const updated = value.map((link, i) =>
			i === index ? { ...link, [field]: newValue } : link
		)
		onChange(updated)
	}

	function moveLink(index: number, direction: "up" | "down") {
		const swapIndex = direction === "up" ? index - 1 : index + 1

		if (swapIndex < 0 || swapIndex >= value.length) {
			return
		}

		const updated = [...value]
		;[updated[index], updated[swapIndex]] = [updated[swapIndex], updated[index]]
		onChange(updated.map((link, i) => ({ ...link, sortOrder: i })))
	}

	return (
		<div className="flex flex-col gap-3">
			{value.map((link, index) => (
				<LinkRow
					key={index}
					link={link}
					index={index}
					total={value.length}
					onLabelChange={(v) => updateLink(index, "label", v)}
					onUrlChange={(v) => updateLink(index, "url", v)}
					onMove={(dir) => moveLink(index, dir)}
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
