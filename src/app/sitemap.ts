import { getSiteUrl } from "@/lib/auth/env"
import { allGuides, getGuidesOverview } from "@/lib/db/guides"
import { getAllPublishedPostSlugs } from "@/lib/db/posts"
import { getAllProjectSlugs } from "@/lib/db/projects"
import { SECTIONS } from "@/lib/db/sections"
import type { MetadataRoute } from "next"

// The sitemap is prerendered, and `getAllPublishedPostSlugs` / the guide
// helpers filter scheduled entries at read time — which only re-runs on
// regeneration. Mutations bust the tags, but a scheduled post going live is
// not a mutation — this time-based backstop bounds how long its URL stays out
// of the sitemap.
export const revalidate = 3600

function url(base: string, path: string): string {
	return `${base}${path}`
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const base = getSiteUrl()

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
		{
			url: url(base, "/projects"),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: url(base, "/tools/loan-calculator"),
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: url(base, "/privacy"),
			changeFrequency: "yearly",
			priority: 0.3,
		},
		{
			url: url(base, "/privacy/body-tracking"),
			changeFrequency: "yearly",
			priority: 0.3,
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
		{
			url: url(base, "/guides"),
			changeFrequency: "weekly",
			priority: 0.6,
		},
	]

	const [posts, projects, guides] = await Promise.all([
		getAllPublishedPostSlugs(),
		getAllProjectSlugs(),
		getGuidesOverview(),
	])

	const postRoutes: MetadataRoute.Sitemap = posts.map((post) => ({
		url: url(base, `/blog/${post.section}/${post.slug}`),
		lastModified: post.updatedAt,
		changeFrequency: "never",
		priority: 0.6,
	}))

	const projectRoutes: MetadataRoute.Sitemap = projects.map((project) => ({
		url: url(base, `/projects/${project.slug}`),
		lastModified: project.updatedAt,
		changeFrequency: "monthly",
		priority: 0.6,
	}))

	// `monthly`, not the posts' `never`: guides are maintained pages, edited in
	// place from Search Console data, and telling a crawler never to come back is
	// the opposite of what that lifecycle needs. `lastModified` is a real
	// `updatedAt` for the same reason. Topic hubs and guides share the flat
	// `/guides/:slug` namespace, so they're emitted alike.
	const guideRoutes: MetadataRoute.Sitemap = [
		...guides.topics,
		...allGuides(guides),
	].map((entry) => ({
		url: url(base, `/guides/${entry.slug}`),
		lastModified: entry.updatedAt,
		changeFrequency: "monthly",
		priority: 0.6,
	}))

	return [...staticRoutes, ...postRoutes, ...projectRoutes, ...guideRoutes]
}
