import Link from "next/link"
import { extractDefinitions, truncateBody } from "@/lib/content/markdown"
import {
	formatDate,
	postDatetimeToISO,
	calculateReadingTime,
} from "@/lib/utils/format"
import PostMarkdownContent from "./PostMarkdownContent"
import type { PostListItem } from "@/lib/db/posts"

interface Props {
	post: PostListItem
}

export default async function PostCard({ post }: Props) {
	const { text: preview, isTruncated } = truncateBody(post.body)
	// Reference-link definitions live at the bottom of a post, past the cut, so
	// a truncated preview would render `[text][label]` as literal brackets.
	const definitions = isTruncated ? extractDefinitions(post.body) : ""
	const excerpt = definitions ? `${preview}\n\n${definitions}` : preview
	const readingTime = post.readingTime ?? calculateReadingTime(post.body)
	const href = `/blog/${post.section}/${post.slug}`

	return (
		<article className="py-8">
			<h2 className="text-primary mb-2 text-2xl font-semibold text-pretty">
				<Link href={href} className="hover:text-accent">
					{post.title}
				</Link>
			</h2>

			<div className="text-secondary mb-4 flex gap-4 text-sm">
				<time dateTime={postDatetimeToISO(post.datetime)}>
					{formatDate(post.datetime)}
				</time>
				{readingTime && <span>{readingTime}</span>}
			</div>

			<div className="text-secondary prose-sm">
				<PostMarkdownContent content={excerpt} />
			</div>

			{isTruncated && (
				<Link href={href} className="link mt-3 inline-block text-sm">
					Continue reading →
				</Link>
			)}
		</article>
	)
}
