import { notFound } from "next/navigation"
import PostContent from "@/components/blog/PostContent"
import PostMarkdownContent from "@/components/blog/PostMarkdownContent"
import PageGlow from "@/components/PageGlow"
import { formatDate, calculateReadingTime } from "@/lib/format"
import { getPostBySlug } from "@/lib/posts"
import { isValidSection } from "@/lib/sections"
import type { Metadata } from "next"

interface Props {
	params: Promise<{ section: string; slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		return {}
	}

	const post = await getPostBySlug(section, slug)

	if (!post) {
		return {}
	}

	// Parse "yyyy-MM-dd-HHmm" → ISO date string for OG publishedTime
	const [year, month, day] = post.datetime.split("-")
	const publishedTime = `${year}-${month}-${day}T00:00:00Z`

	return {
		title: post.title,
		description: post.summary ?? undefined,
		openGraph: {
			type: "article",
			title: post.title,
			description: post.summary ?? undefined,
			url: `/blog/${post.section}/${post.slug}`,
			publishedTime,
			images: post.imageUrl ? [post.imageUrl] : undefined,
		},
		twitter: {
			title: post.title,
			description: post.summary ?? undefined,
			images: post.imageUrl ? [post.imageUrl] : undefined,
		},
	}
}

export default async function PostPage({ params }: Props) {
	const { section, slug } = await params

	if (!isValidSection(section)) {
		notFound()
	}

	const post = await getPostBySlug(section, slug)

	if (!post) {
		notFound()
	}

	const readingTime = post.readingTime ?? calculateReadingTime(post.body)

	return (
		<>
			<PageGlow />
			<PostContent
				title={post.title}
				formattedDate={formatDate(post.datetime)}
				datetime={post.datetime}
				readingTime={readingTime}
			>
				<PostMarkdownContent content={post.body} />
			</PostContent>
		</>
	)
}
