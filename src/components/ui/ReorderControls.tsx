// Both handlers are required even when the corresponding `canMove*` is false,
// so we can't ship a live button that calls into thin air. The `canMove*`
// flags drive the disabled state only.
interface Props {
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove?: () => void
	canMoveUp: boolean
	canMoveDown: boolean
	removeLabel?: string
}

export default function ReorderControls({
	onMoveUp,
	onMoveDown,
	onRemove,
	canMoveUp,
	canMoveDown,
	removeLabel = "Remove",
}: Props) {
	return (
		<div className="flex shrink-0 gap-1">
			<button
				type="button"
				onClick={onMoveUp}
				disabled={!canMoveUp}
				className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
				aria-label="Move up"
			>
				↑
			</button>
			<button
				type="button"
				onClick={onMoveDown}
				disabled={!canMoveDown}
				className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30"
				aria-label="Move down"
			>
				↓
			</button>

			{onRemove && (
				<button
					type="button"
					onClick={onRemove}
					className="text-secondary hover:text-primary rounded px-1.5 py-1 text-sm transition-colors"
				>
					{removeLabel}
				</button>
			)}
		</div>
	)
}
