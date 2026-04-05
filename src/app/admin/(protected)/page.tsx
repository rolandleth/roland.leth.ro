import Link from "next/link"
import AdminSearch from "@/components/admin/AdminSearch"
import ProjectSortOrderInput from "@/components/admin/ProjectSortOrderInput"
import { prisma } from "@/lib/db"
import { formatDate } from "@/lib/format"

const PAGE_SIZE = 20

function fetchPosts(isSearching: boolean, query: string, skip: number) {
	if (isSearching) {
		return prisma.post.findMany({
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
	}

	return prisma.post.findMany({
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
	})
}

function fetchProjects(isSearching: boolean, query: string, skip: number) {
	if (isSearching) {
		return prisma.project.findMany({
			where: { name: { contains: query, mode: "insensitive" } },
			select: { id: true, name: true, platform: true, isFeatured: true, sortOrder: true },
			orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
		})
	}

	return prisma.project.findMany({
		select: { id: true, name: true, platform: true, isFeatured: true, sortOrder: true },
		orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
		take: PAGE_SIZE,
		skip,
	})
}

async function fetchTabData(
	tab: "posts" | "projects",
	isSearching: boolean,
	query: string,
	skip: number
) {
	return Promise.all([
		tab === "posts"
			? fetchPosts(isSearching, query, skip)
			: Promise.resolve([]),
		tab === "posts" && !isSearching ? prisma.post.count() : Promise.resolve(0),
		tab === "projects"
			? fetchProjects(isSearching, query, skip)
			: Promise.resolve([]),
		tab === "projects" && !isSearching
			? prisma.project.count()
			: Promise.resolve(0),
	])
}

interface PageProps {
	searchParams: Promise<{ tab?: string; page?: string; q?: string }>
}

export default async function AdminDashboard({ searchParams }: PageProps) {
	const { tab: tabParam, page: pageParam, q: queryParam } = await searchParams

	const tab = tabParam === "projects" ? "projects" : "posts"
	const query = queryParam?.trim() ?? ""
	const isSearching = query.length > 0
	const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1)
	const skip = (page - 1) * PAGE_SIZE

	const tabBase = tab === "posts" ? "/admin" : "/admin?tab=projects"

	function pageUrl(p: number): string {
		if (p === 1) {
			return tabBase
		}

		return `${tabBase}${tab === "posts" ? "?" : "&"}page=${p}`
	}

	const [posts, postCount, projects, projectCount] = await fetchTabData(
		tab,
		isSearching,
		query,
		skip
	)

	const totalCount = tab === "posts" ? postCount : projectCount
	const totalPages = Math.ceil(totalCount / PAGE_SIZE)

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

			{tab === "posts" && (
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
							<div
								key={post.id}
								className="flex items-center justify-between py-3"
							>
								<div>
									<p className="text-primary text-sm font-medium">
										{post.title}
									</p>
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
				</section>
			)}

			{tab === "projects" && (
				<section>
					<div className="mb-4 flex items-center justify-between">
						<p className="text-secondary text-xs">
							{isSearching
								? `${projects.length} result${projects.length === 1 ? "" : "s"}`
								: `${projectCount} projects`}
						</p>
						<Link
							href="/admin/projects/new"
							className="text-accent text-sm transition-opacity hover:opacity-75"
						>
							New project
						</Link>
					</div>

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
								<div className="flex items-center gap-4">
									{!isSearching && (
										<ProjectSortOrderInput
											key={`${project.id}-${project.sortOrder}`}
											projectId={project.id}
											initialSortOrder={project.sortOrder}
											totalCount={projectCount}
										/>
									)}
									<Link
										href={`/admin/projects/${project.id}/edit`}
										className="text-secondary hover:text-primary text-xs transition-colors"
									>
										Edit
									</Link>
								</div>
							</div>
						))}

						{projects.length === 0 && (
							<p className="text-secondary py-4 text-sm">
								{isSearching
									? `No results for "${query}".`
									: "No projects yet."}
							</p>
						)}
					</div>
				</section>
			)}

			{!isSearching && totalPages > 1 && (
				<nav className="flex items-center justify-between">
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
		</div>
	)
}
