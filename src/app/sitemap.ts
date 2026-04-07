import { prisma } from "@/lib/db"
import { currentDatetimeString } from "@/lib/format"
import { siteBase } from "@/lib/request"
import { SECTIONS } from "@/lib/sections"
import type { MetadataRoute } from "next"

function url(base: string, path: string): string {
	return `${base}${path}`
}

/**
 * Parses the date portion of a `yyyy-MM-dd-HHmm` datetime string into
 * a `Date` object for use as `lastModified` in sitemap entries.
 */
function parsePostDate(datetime: string): Date {
	return new Date(datetime.slice(0, 10))
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = await siteBase()

	const staticRoutes: MetadataRoute.Sitemap = [
		{
			url: url(base, "/"),
			changeFrequency: "weekly",
			priority: 1.0,
		},
		{
			url: url(base, "/about"),
			changeFrequency: "weekly",
			priority: 0.7,
		},
		...SECTIONS.map((section) => ({
			url: url(base, `/blog/${section}`),
			changeFrequency: "weekly" as const,
			priority: 0.8,
		})),
		...SECTIONS.map((section) => ({
			url: url(base, `/blog/${section}/archive`),
			changeFrequency: "weekly" as const,
			priority: 0.5,
		})),
	]

	const posts = await prisma.post.findMany({
		where: { published: true, datetime: { lte: currentDatetimeString() } },
		select: { slug: true, section: true, datetime: true },
		orderBy: { datetime: "desc" },
	})

	const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
		url: url(base, `/blog/${post.section}/${post.slug}`),
		lastModified: parsePostDate(post.datetime),
		changeFrequency: "never",
		priority: 0.6,
	}))

	return [...staticRoutes, ...postRoutes]
}
