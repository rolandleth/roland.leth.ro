import Link from "next/link"
import AdminSearch from "@/components/admin/AdminSearch"
import PostsTab from "@/components/admin/PostsTab"
import ProjectsTab from "@/components/admin/ProjectsTab"
import { parseTab } from "@/lib/client/adminPageUrl"
import { parsePageParam } from "@/lib/utils/format"

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
					aria-current={tab === "posts" ? "page" : undefined}
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
					aria-current={tab === "projects" ? "page" : undefined}
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

			{tab === "posts" && <PostsTab query={query} page={page} />}
			{tab === "projects" && <ProjectsTab query={query} page={page} />}
		</div>
	)
}
