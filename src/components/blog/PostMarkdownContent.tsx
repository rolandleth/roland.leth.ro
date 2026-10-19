import { markdownToReact } from "@/lib/content/markdown"

interface Props {
	content: string
	/** A blog list card's preview; see `markdownToReact`. */
	isListCard?: boolean
}

export default async function PostMarkdownContent({
	content,
	isListCard = false,
}: Props) {
	const node = await markdownToReact(content, { isListCard })

	return <div className="prose dark:prose-invert max-w-none">{node}</div>
}
