import Link from "next/link"
import AdminSearch from "@/components/admin/AdminSearch"
import IsFeaturedToggle from "@/components/admin/IsFeaturedToggle"
import ProjectSortOrderInput from "@/components/admin/ProjectSortOrderInput"
import CompactProjectCard from "@/components/projects/CompactProjectCard"
import FeaturedProjectCard from "@/components/projects/FeaturedProjectCard"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/format"
import { groupByPlatform } from "@/lib/platforms"
import { getAllProjectsForGallery } from "@/lib/projects"
import type { ProjectGalleryItem } from "@/lib/projects"

const PAGE_SIZE = 20

// ---------------------------------------------------------------------------
// Posts section
// ---------------------------------------------------------------------------

async function PostsSection({ query, page }: { query: string; page: number }) {
	const isSearching = query.length > 0
	const skip = (page - 1) * PAGE_SIZE

	const [posts, postCount] = await Promise.all([
		isSearching
			? prisma.post.findMany({
					where: { title: { contains: query, mode: "insensitive" } },
					select: {
						id: true,
						title: true,
						section: true,
						datetime: true,
						published: true,
					},
					orderBy: { datetime: "desc" },
				})
			: prisma.post.findMany({
					select: {
						id: true,
						title: true,
						section: true,
						datetime: true,
						published: true,
					},
					orderBy: { datetime: "desc" },
					take: PAGE_SIZE,
					skip,
				}),
		isSearching ? Promise.resolve(0) : prisma.post.count(),
	])

	const totalPages = Math.ceil(postCount / PAGE_SIZE)

	function pageUrl(p: number): string {
		if (p === 1) {
			return "/admin"
		}

		return `/admin?page=${p}`
	}

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<p className="text-secondary text-xs">
					{isSearching
						? `${posts.length} result${posts.length === 1 ? "" : "s"}`
						: `${postCount} posts`}
				</p>
				<Link
					href="/admin/posts/new"
					className="text-accent text-sm transition-opacity hover:opacity-75"
				>
					New post
				</Link>
			</div>

			<div className="divide-border divide-y">
				{posts.map((post) => (
					<div key={post.id} className="flex items-center justify-between py-3">
						<div>
							<p className="text-primary text-sm font-medium">{post.title}</p>
							<p className="text-secondary mt-0.5 text-xs">
								{post.section} · {formatDate(post.datetime)}
								{!post.published && " · Draft"}
							</p>
						</div>
						<Link
							href={`/admin/posts/${post.id}/edit`}
							className="text-secondary hover:text-primary text-xs transition-colors"
						>
							Edit
						</Link>
					</div>
				))}

				{posts.length === 0 && (
					<p className="text-secondary py-4 text-sm">
						{isSearching ? `No results for "${query}".` : "No posts yet."}
					</p>
				)}
			</div>

			{!isSearching && totalPages > 1 && (
				<nav className="mt-6 flex items-center justify-between">
					{page > 1 ? (
						<Link
							href={pageUrl(page - 1)}
							className="text-secondary hover:text-primary text-sm transition-colors"
						>
							← Previous
						</Link>
					) : (
						<div />
					)}

					<p className="text-secondary text-xs">
						{page} / {totalPages}
					</p>

					{page < totalPages ? (
						<Link
							href={pageUrl(page + 1)}
							className="text-secondary hover:text-primary text-sm transition-colors"
						>
							Next →
						</Link>
					) : (
						<div />
					)}
				</nav>
			)}
		</section>
	)
}

// ---------------------------------------------------------------------------
// Projects section
// ---------------------------------------------------------------------------

function ProjectsGroupedView({ projects }: { projects: ProjectGalleryItem[] }) {
	const featured = projects.filter((p) => p.isFeatured)
	const others = projects.filter((p) => !p.isFeatured)
	const platformGroups = groupByPlatform(others)
	const totalCount = projects.length

	return (
		<div className="flex flex-col gap-10">
			{featured.length > 0 && (
				<div>
					<h3 className="text-secondary mb-4 text-xs font-semibold tracking-widest uppercase">
						Featured
					</h3>

					<div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
						{featured.map((project) => (
							<FeaturedProjectCard
								key={project.id}
								project={project}
								href={`/admin/projects/${project.id}/edit`}
							>
								<div className="mt-2 flex items-center justify-between gap-3 px-1">
									<IsFeaturedToggle
										projectId={project.id}
										initialIsFeatured={project.isFeatured}
									/>
									<ProjectSortOrderInput
										key={`${project.id}-${project.sortOrder}`}
										projectId={project.id}
										initialSortOrder={project.sortOrder}
										totalCount={totalCount}
									/>
								</div>
							</FeaturedProjectCard>
						))}
					</div>
				</div>
			)}

			{platformGroups.map((group) => (
				<div key={group.label}>
					<h3 className="text-secondary mb-4 text-xs font-semibold tracking-widest uppercase">
						{group.label}
					</h3>

					<div className="grid grid-cols-4 gap-1 sm:grid-cols-6 md:grid-cols-8">
						{group.projects.map((project) => (
							<CompactProjectCard
								key={project.id}
								project={project}
								href={`/admin/projects/${project.id}/edit`}
							>
								<div className="mt-1 flex flex-col items-center gap-1">
									<IsFeaturedToggle
										projectId={project.id}
										initialIsFeatured={project.isFeatured}
									/>
									<ProjectSortOrderInput
										key={`${project.id}-${project.sortOrder}`}
										projectId={project.id}
										initialSortOrder={project.sortOrder}
										totalCount={totalCount}
									/>
								</div>
							</CompactProjectCard>
						))}
					</div>
				</div>
			))}

			{projects.length === 0 && (
				<p className="text-secondary py-4 text-sm">No projects yet.</p>
			)}
		</div>
	)
}

async function ProjectsSection({ query }: { query: string }) {
	const isSearching = query.length > 0

	const projects = isSearching
		? await prisma.project.findMany({
				where: { name: { contains: query, mode: "insensitive" } },
				select: {
					id: true,
					name: true,
					slug: true,
					summary: true,
					platform: true,
					role: true,
					accentColor: true,
					isFeatured: true,
					isDiscontinued: true,
					sortOrder: true,
					icon: true,
					heroImage: true,
				},
				orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
			})
		: await getAllProjectsForGallery({ sortDiscontinued: false })

	return (
		<section>
			<div className="mb-4 flex items-center justify-between">
				<p className="text-secondary text-xs">
					{isSearching
						? `${projects.length} result${projects.length === 1 ? "" : "s"}`
						: `${projects.length} projects`}
				</p>
				<Link
					href="/admin/projects/new"
					className="text-accent text-sm transition-opacity hover:opacity-75"
				>
					New project
				</Link>
			</div>

			{isSearching ? (
				<div className="divide-border divide-y">
					{projects.map((project) => (
						<div
							key={project.id}
							className="flex items-center justify-between py-3"
						>
							<div>
								<p className="text-primary text-sm font-medium">
									{project.name}
								</p>
								<p className="text-secondary mt-0.5 text-xs">
									{project.platform}
									{project.isFeatured && " · Featured"}
								</p>
							</div>
							<Link
								href={`/admin/projects/${project.id}/edit`}
								className="text-secondary hover:text-primary text-xs transition-colors"
							>
								Edit
							</Link>
						</div>
					))}

					{projects.length === 0 && (
						<p className="text-secondary py-4 text-sm">
							No results for &quot;{query}&quot;.
						</p>
					)}
				</div>
			) : (
				<ProjectsGroupedView projects={projects} />
			)}
		</section>
	)
}

// ---------------------------------------------------------------------------
// Page shell
// ---------------------------------------------------------------------------

interface PageProps {
	searchParams: Promise<{ tab?: string; page?: string; q?: string }>
}

export default async function AdminDashboard({ searchParams }: PageProps) {
	const { tab: tabParam, page: pageParam, q: queryParam } = await searchParams

	const tab = tabParam === "projects" ? "projects" : "posts"
	const query = queryParam?.trim() ?? ""
	const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)

	return (
		<div className="flex flex-col gap-6">
			<div className="border-border flex items-end border-b">
				<Link
					href="/admin"
					className={`px-4 pb-3 text-sm font-medium transition-colors ${
						tab === "posts"
							? "border-accent text-primary -mb-px border-b-2"
							: "text-secondary hover:text-primary"
					}`}
				>
					Posts
				</Link>
				<Link
					href="/admin?tab=projects"
					className={`px-4 pb-3 text-sm font-medium transition-colors ${
						tab === "projects"
							? "border-accent text-primary -mb-px border-b-2"
							: "text-secondary hover:text-primary"
					}`}
				>
					Projects
				</Link>
				<div className="mb-3 ml-auto">
					<AdminSearch tab={tab} query={query} />
				</div>
			</div>

			{tab === "posts" && <PostsSection query={query} page={page} />}
			{tab === "projects" && <ProjectsSection query={query} />}
		</div>
	)
}
