"use client"

import MarkdownEditor from "@/components/admin/MarkdownEditor"
import { useOrderedList } from "@/components/admin/useOrderedList"
import ReorderControls from "@/components/ui/ReorderControls"

export interface FaqItem {
	_key: string
	question: string
	answer: string
	sortOrder: number
}

interface FaqCardProps {
	faq: FaqItem
	index: number
	total: number
	onQuestionChange: (value: string) => void
	onAnswerChange: (value: string) => void
	onMoveUp: () => void
	onMoveDown: () => void
	onRemove: () => void
}

function FaqCard({
	faq,
	index,
	total,
	onQuestionChange,
	onAnswerChange,
	onMoveUp,
	onMoveDown,
	onRemove,
}: FaqCardProps) {
	return (
		<div className="border-border rounded-lg border">
			<div className="flex items-center gap-2 p-3">
				<input
					type="text"
					value={faq.question}
					onChange={(e) => onQuestionChange(e.target.value)}
					placeholder="Question"
					aria-label="FAQ question"
					className="admin-input min-w-0 flex-1 py-1.5"
				/>

				<ReorderControls
					canMoveUp={index > 0}
					canMoveDown={index < total - 1}
					onMoveUp={onMoveUp}
					onMoveDown={onMoveDown}
					onRemove={onRemove}
				/>
			</div>

			<div className="border-border flex flex-col gap-1.5 border-t p-4">
				<span className="text-secondary text-sm font-medium">Answer</span>
				<MarkdownEditor
					value={faq.answer}
					onChange={onAnswerChange}
					placeholder="Answer (Markdown supported)…"
				/>
			</div>
		</div>
	)
}

interface Props {
	value: FaqItem[]
	onChange: (faqs: FaqItem[]) => void
}

export default function FaqManager({ value, onChange }: Props) {
	const list = useOrderedList<FaqItem>(value, onChange)

	return (
		<div className="flex flex-col gap-3">
			{value.map((faq, index) => (
				<FaqCard
					key={faq._key}
					faq={faq}
					index={index}
					total={value.length}
					onQuestionChange={(question) => list.update(index, { question })}
					onAnswerChange={(answer) => list.update(index, { answer })}
					onMoveUp={() => list.move(index, "up")}
					onMoveDown={() => list.move(index, "down")}
					onRemove={() => list.remove(index)}
				/>
			))}

			<button
				type="button"
				onClick={() => list.add(() => ({ question: "", answer: "" }))}
				className="border-border text-secondary hover:text-primary self-start rounded-md border px-3 py-2 text-sm transition-colors"
			>
				Add FAQ
			</button>
		</div>
	)
}
