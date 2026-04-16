import Link from "next/link"
import AdminSearch from "@/components/admin/AdminSearch"
import ProjectAdminGroup from "@/components/admin/ProjectAdminGroup"
import { formatDate, parsePageParam } from "@/lib/format"
import { groupByPlatform } from "@/lib/platforms"
import { listPostsForAdmin } from "@/lib/posts"
import { listProjectsForAdmin } from "@/lib/projects"
import type { ProjectGalleryItem } from "@/lib/projects"

const ADMIN_TABS = ["posts", "projects"] as const
type AdminTab = (typeof ADMIN_TABS)[number]

function parseTab(raw: string | undefined): AdminTab {
	if (raw != null && (ADMIN_TABS as readonly string[]).includes(raw)) {
		return raw as AdminTab
	}

	return "posts"
}

async function PostsSection({ query, page }: { query: string; page: number }) {
	const isSearching = query.length > 0
	const { posts, totalCount, totalPages } = await listPostsForAdmin({
		query,
		page,
	})

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
						? `${totalCount} result${totalCount === 1 ? "" : "s"}`
						: `${totalCount} posts`}
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

function ProjectsGroupedView({ projects }: { projects: ProjectGalleryItem[] }) {
	const featured = projects.filter((p) => p.isFeatured)
	const others = projects.filter((p) => !p.isFeatured)
	const platformGroups = groupByPlatform(others)
	const totalCount = projects.length

	if (projects.length === 0) {
		return <p className="text-secondary py-4 text-sm">No projects yet.</p>
	}

	return (
		<div className="flex flex-col gap-10">
			<ProjectAdminGroup
				label="Featured"
				projects={featured}
				totalCount={totalCount}
			/>

			{platformGroups.map((group) => (
				<ProjectAdminGroup
					key={group.label}
					label={group.label}
					projects={group.projects}
					totalCount={totalCount}
				/>
			))}
		</div>
	)
}

async function ProjectsSection({ query }: { query: string }) {
	const isSearching = query.length > 0
	const projects = await listProjectsForAdmin({ query })

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

interface PageProps {
	searchParams: Promise<{ tab?: string; page?: string; q?: string }>
}

export default async function AdminDashboard({ searchParams }: PageProps) {
	const { tab: tabParam, page: pageParam, q: queryParam } = await searchParams

	const tab = parseTab(tabParam)
	const query = queryParam?.trim() ?? ""
	const page = parsePageParam(pageParam)

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
