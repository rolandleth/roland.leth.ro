import Link from "next/link"
import { feedLinkForSection } from "@/lib/content/feed"
import { formatDate, formatDayMonth } from "@/lib/utils/format"
import type { Section } from "@/lib/db/sections"

interface Props {
	title: string
	datetime: string
	section: Section
}

/**
 * What a scheduled post's URL serves until the post goes live: the 404 page's
 * design (backdrop glyph, heading, secondary copy) with the publish date as
 * the glyph. Served with a 200 and `noindex` metadata — see the post page's
 * scheduled branch. Prerendered and pinned like the post itself, so the
 * revalidate-scheduled cron is what replaces it with the live post.
 */
export default function ScheduledPostNotice({
	title,
	datetime,
	section,
}: Props) {
	const feed = feedLinkForSection(section)

	return (
		<div className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
			<p
				aria-hidden
				className="text-[5.5rem] leading-none font-bold whitespace-nowrap text-(--color-accent) opacity-10 select-none sm:text-[7rem]"
			>
				{formatDayMonth(datetime)}
			</p>

			<h1 className="-mt-4 text-3xl font-bold">Scheduled</h1>

			<p className="text-secondary max-w-m mt-3 leading-relaxed text-pretty sm:text-wrap">
				<span className="font-medium">“{title}”</span> isn’t live yet.
				<br /> Come back on {formatDate(datetime)}, or grab{" "}
				<a
					href={feed.path}
					className="text-(--color-accent) transition-opacity hover:opacity-75"
				>
					the feed
				</a>{" "}
				and wait for it.
			</p>

			<Link
				href={`/blog/${section}`}
				className="mt-10 text-sm text-(--color-accent) transition-opacity hover:opacity-75"
			>
				← Back to the blog
			</Link>
		</div>
	)
}
