"use client"

interface LinkItem {
	label: string
	url: string
	sortOrder: number
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
				<div key={index} className="flex items-center gap-2">
					<input
						type="text"
						value={link.label}
						onChange={(e) => updateLink(index, "label", e.target.value)}
						placeholder="Label"
						className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none"
					/>
					<input
						type="text"
						value={link.url}
						onChange={(e) => updateLink(index, "url", e.target.value)}
						placeholder="https://..."
						className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none"
					/>

					<div className="flex shrink-0 gap-1">
						<button
							type="button"
							onClick={() => moveLink(index, "up")}
							disabled={index === 0}
							className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
							aria-label="Move up"
						>
							↑
						</button>
						<button
							type="button"
							onClick={() => moveLink(index, "down")}
							disabled={index === value.length - 1}
							className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
							aria-label="Move down"
						>
							↓
						</button>
						<button
							type="button"
							onClick={() => removeLink(index)}
							className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors"
						>
							Remove
						</button>
					</div>
				</div>
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
