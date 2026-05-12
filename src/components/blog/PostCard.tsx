import Link from "next/link"
import {
	formatDate,
	postDatetimeToISO,
	calculateReadingTime,
	truncateBody,
} from "@/lib/format"
import PostMarkdownContent from "./PostMarkdownContent"
import type { PostListItem } from "@/lib/posts"

interface Props {
	post: PostListItem
}

export default async function PostCard({ post }: Props) {
	const { text: preview, isTruncated } = truncateBody(post.body)
	const readingTime = post.readingTime ?? calculateReadingTime(post.body)
	const href = `/blog/${post.section}/${post.slug}`

	return (
		<article className="py-8">
			<h2 className="text-primary mb-2 text-2xl font-semibold">
				<Link href={href} className="hover:text-accent">
					{post.title}
				</Link>
			</h2>

			<div className="text-secondary mb-4 flex gap-4 text-sm">
				<time dateTime={postDatetimeToISO(post.datetime) ?? undefined}>
					{formatDate(post.datetime)}
				</time>
				{readingTime && <span>{readingTime}</span>}
			</div>

			<div className="text-secondary prose-sm">
				<PostMarkdownContent content={preview} />
			</div>

			{isTruncated && (
				<Link href={href} className="link mt-3 inline-block text-sm">
					Continue reading →
				</Link>
			)}
		</article>
	)
}
