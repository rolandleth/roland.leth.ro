"use client"

import { useState } from "react"
import { PLATFORM_BUCKETS } from "@/lib/platforms"

interface Props {
	value: string
	onChange: (value: string) => void
}

export default function PlatformPicker({ value, onChange }: Props) {
	const allKeywords = PLATFORM_BUCKETS.flatMap((b) => b.keywords)

	const parsedKeywords = value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => allKeywords.includes(s))

	// If the initial value's keywords span multiple buckets there is no clean
	// bucket to lock to, so treat the whole value as freeform instead of
	// entering a state where some selected keywords are stuck in a locked bucket.
	const spannedBuckets = PLATFORM_BUCKETS.filter((b) =>
		b.keywords.some((kw) => parsedKeywords.includes(kw))
	)
	const validParsedKeywords = spannedBuckets.length <= 1 ? parsedKeywords : []
	const isInitiallyFreeform = value !== "" && validParsedKeywords.length === 0

	const [selectedKeywords, setSelectedKeywords] =
		useState<string[]>(validParsedKeywords)
	const [freeform, setFreeform] = useState(isInitiallyFreeform ? value : "")

	// All selected keywords should belong to the same bucket — find it
	const activeBucket =
		selectedKeywords.length > 0
			? (PLATFORM_BUCKETS.find((b) =>
					b.keywords.some((kw) => selectedKeywords.includes(kw))
				) ?? null)
			: null

	function toggleKeyword(keyword: string) {
		const next = selectedKeywords.includes(keyword)
			? selectedKeywords.filter((k) => k !== keyword)
			: [...selectedKeywords, keyword]

		setSelectedKeywords(next)
		onChange(next.join(", "))
	}

	function handleFreeformChange(v: string) {
		setFreeform(v)
		onChange(v)
	}

	const isFreeformActive = freeform !== ""

	return (
		<div className="flex flex-col gap-2">
			{PLATFORM_BUCKETS.map((bucket) => {
				const isBucketLocked =
					isFreeformActive ||
					(activeBucket !== null && activeBucket.label !== bucket.label)

				return (
					<div key={bucket.label} className="flex items-start gap-3">
						<span className="text-secondary w-24 shrink-0 pt-1.5 text-xs font-medium">
							{bucket.label}
						</span>
						<div className="flex flex-wrap gap-1.5">
							{bucket.keywords.map((keyword) => {
								const isSelected = selectedKeywords.includes(keyword)
								const isDisabled = isBucketLocked && !isSelected

								return (
									<button
										key={keyword}
										type="button"
										disabled={isDisabled}
										onClick={() => toggleKeyword(keyword)}
										className={[
											"rounded-full border px-3 py-1 text-sm transition-colors",
											isSelected
												? "border-accent bg-accent/10 text-accent"
												: "border-border text-secondary hover:text-primary hover:border-primary",
											isDisabled ? "cursor-not-allowed opacity-30" : "",
										].join(" ")}
									>
										{keyword}
									</button>
								)
							})}
						</div>
					</div>
				)
			})}

			<input
				aria-label="Platform"
				type="text"
				placeholder="or type freely…"
				value={freeform}
				onChange={(e) => handleFreeformChange(e.target.value)}
				disabled={selectedKeywords.length > 0}
				className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
			/>

			{/* Hidden input for native form required validation */}
			<input
				type="text"
				required
				readOnly
				tabIndex={-1}
				value={selectedKeywords.join(", ") || freeform}
				className="sr-only"
				aria-hidden="true"
			/>
		</div>
	)
}
