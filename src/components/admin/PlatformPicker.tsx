"use client"

import { useState } from "react"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	BUCKET_SUGGESTED_TAGS,
	bucketLabel,
	tagLabel,
} from "@/lib/utils/platforms"

interface Props {
	bucket: PlatformBucket | null
	tags: PlatformTag[]
	onChange: (next: {
		bucket: PlatformBucket | null
		tags: PlatformTag[]
	}) => void
}

const ALL_BUCKETS = Object.values(PlatformBucket)

/**
 * Editorial bucket (radio) + descriptive tags (chip multi-select scoped to
 * the bucket's suggested set). Storage is `{ bucket, tags: PlatformTag[] }`
 * — no freeform input, no comma-string reverse-parsing, no per-bucket
 * locking. Changing the bucket prunes any selected tags that aren't
 * suggested for the new bucket (keeps the form in a representable state).
 */
export default function PlatformPicker({ bucket, tags, onChange }: Props) {
	const suggestedTags = bucket != null ? BUCKET_SUGGESTED_TAGS[bucket] : []
	// Surface a transient hint when a bucket switch drops tags that aren't in
	// the new bucket's suggested set, so the user understands why their prior
	// selection shrank. Previously the prune happened silently. Cleared on any
	// tag interaction so the message stays accurate to what's onscreen.
	const [prunedCount, setPrunedCount] = useState(0)

	function selectBucket(nextBucket: PlatformBucket) {
		if (nextBucket === bucket) {
			return
		}

		const nextSuggested = new Set(BUCKET_SUGGESTED_TAGS[nextBucket])
		const prunedTags = tags.filter((t) => nextSuggested.has(t))

		setPrunedCount(tags.length - prunedTags.length)
		onChange({ bucket: nextBucket, tags: prunedTags })
	}

	function toggleTag(tag: PlatformTag) {
		const nextTags = tags.includes(tag)
			? tags.filter((t) => t !== tag)
			: [...tags, tag]

		setPrunedCount(0)
		onChange({ bucket, tags: nextTags })
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-secondary w-24 shrink-0 text-xs font-medium">
					Bucket
				</span>
				<div className="flex flex-wrap gap-1.5">
					{ALL_BUCKETS.map((b) => {
						const isSelected = b === bucket

						return (
							<button
								key={b}
								type="button"
								onClick={() => selectBucket(b)}
								className={[
									"rounded-full border px-3 py-1 text-sm transition-colors",
									isSelected
										? "border-accent bg-accent/10 text-accent"
										: "border-border text-secondary hover:text-primary hover:border-primary",
								].join(" ")}
							>
								{bucketLabel(b)}
							</button>
						)
					})}
				</div>
			</div>

			<div className="flex flex-wrap items-start gap-2">
				<span className="text-secondary w-24 shrink-0 pt-1.5 text-xs font-medium">
					Tags
				</span>
				<div className="flex flex-wrap gap-1.5">
					{bucket == null ? (
						<span className="text-secondary pt-1.5 text-xs italic">
							Pick a bucket to see tags.
						</span>
					) : (
						suggestedTags.map((tag) => {
							const isSelected = tags.includes(tag)

							return (
								<button
									key={tag}
									type="button"
									onClick={() => toggleTag(tag)}
									className={[
										"rounded-full border px-3 py-1 text-sm transition-colors",
										isSelected
											? "border-accent bg-accent/10 text-accent"
											: "border-border text-secondary hover:text-primary hover:border-primary",
									].join(" ")}
								>
									{tagLabel(tag)}
								</button>
							)
						})
					)}
				</div>
			</div>

			{prunedCount > 0 && (
				<p
					className="text-secondary pl-26 text-xs italic"
					role="status"
					aria-live="polite"
				>
					Removed {prunedCount} {prunedCount === 1 ? "tag" : "tags"} not valid
					for this bucket.
				</p>
			)}
		</div>
	)
}
