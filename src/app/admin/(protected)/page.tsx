import Link from "next/link"
import AdminSearch from "@/components/admin/AdminSearch"
import GuidesTab from "@/components/admin/GuidesTab"
import PostsTab from "@/components/admin/PostsTab"
import ProjectsTab from "@/components/admin/ProjectsTab"
import RevalidatePanel from "@/components/admin/RevalidatePanel"
import {
	ADMIN_TABS,
	buildAdminPageUrl,
	parseTab,
	type AdminTab,
} from "@/lib/client/adminPageUrl"
import { parsePageParam } from "@/lib/utils/format"

interface PageProps {
	searchParams: Promise<{ tab?: string; page?: string; q?: string }>
}

const TAB_LABELS: Record<AdminTab, string> = {
	posts: "Posts",
	projects: "Projects",
	guides: "Guides",
}

export default async function AdminDashboard({ searchParams }: PageProps) {
	const { tab: tabParam, page: pageParam, q: queryParam } = await searchParams

	const tab = parseTab(tabParam)
	const query = queryParam?.trim() ?? ""
	const page = parsePageParam(pageParam)

	return (
		<div className="flex flex-col gap-6">
			<RevalidatePanel />

			<div className="border-border flex items-end border-b">
				{/* Switching tabs drops the query and page — the search box is scoped
				    per tab, so carrying `?q=` across would show a result count for a
				    term the new tab never matched. */}
				{ADMIN_TABS.map((candidate) => (
					<Link
						key={candidate}
						href={buildAdminPageUrl({ tab: candidate, query: "", page: 1 })}
						aria-current={tab === candidate ? "page" : undefined}
						className={`px-4 pb-3 text-sm font-medium transition-colors ${
							tab === candidate
								? "border-accent text-primary -mb-px border-b-2"
								: "text-secondary hover:text-primary"
						}`}
					>
						{TAB_LABELS[candidate]}
					</Link>
				))}
				<div className="mb-3 ml-auto">
					<AdminSearch tab={tab} query={query} />
				</div>
			</div>

			{tab === "posts" && <PostsTab query={query} page={page} />}
			{tab === "projects" && <ProjectsTab query={query} page={page} />}
			{tab === "guides" && <GuidesTab query={query} page={page} />}
		</div>
	)
}
