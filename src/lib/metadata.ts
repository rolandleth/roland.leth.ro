import type { Metadata } from "next"

export interface PageMetadataInput {
	title: string
	description?: string
	path: string
	image?: string | null
	publishedTime?: string
	type?: "article" | "website"
}

/**
 * Builds a `Metadata` object with consistent `openGraph` and `twitter` fields.
 * The root layout sets `metadataBase`, so relative `path` values resolve correctly.
 * `title` is passed as the plain page title and picks up the layout's
 * `"%s | Roland Leth"` template; `openGraph.title` is expanded here because
 * OG fields do not honor the template.
 */
export function buildPageMetadata(input: PageMetadataInput): Metadata {
	const { title, description, path, image, publishedTime, type } = input
	const ogTitle = `${title} | Roland Leth`
	const images = image ? [image] : undefined

	return {
		title,
		description,
		openGraph: {
			type: type ?? "website",
			title: ogTitle,
			description,
			url: path,
			publishedTime,
			images,
		},
		twitter: {
			title: ogTitle,
			description,
			images,
		},
	}
}
