import { markdownToReact } from "@/lib/content/markdown"

interface Props {
	content: string
}

export default async function PostMarkdownContent({ content }: Props) {
	const node = await markdownToReact(content)

	// `prose-img:mx-auto`: preflight makes `<img>` block-level, so a markdown
	// image narrower than the column sat flush left; centred reads as placed.
	return (
		<div className="prose prose-img:mx-auto dark:prose-invert max-w-none">
			{node}
		</div>
	)
}
