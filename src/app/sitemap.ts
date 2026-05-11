import { getAllPublishedPostSlugs } from "@/lib/posts"
import { getAllProjectSlugs } from "@/lib/projects"
import { siteBase } from "@/lib/request"
import { SECTIONS } from "@/lib/sections"
import type { MetadataRoute } from "next"

function url(base: string, path: string): string {
	return `${base}${path}`
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
	]

	const [posts, projects] = await Promise.all([
		getAllPublishedPostSlugs(),
		getAllProjectSlugs(),
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

	return [...staticRoutes, ...postRoutes, ...projectRoutes]
}
