import { markdownToReact } from "@/lib/content/markdown"

interface Props {
	content: string
}

export default async function PostMarkdownContent({ content }: Props) {
	const node = await markdownToReact(content)

	return <div className="prose dark:prose-invert max-w-none">{node}</div>
}
