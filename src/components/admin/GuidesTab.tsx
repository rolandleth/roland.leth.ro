import Link from "next/link"
import AdminPagination from "@/components/admin/AdminPagination"
import BooleanFlagToggle from "@/components/admin/BooleanFlagToggle"
import { buildAdminPageUrl } from "@/lib/client/adminPageUrl"
import { isScheduledGuide } from "@/lib/db/guideMappers"
import { listGuidesForAdmin, listGuideTopicsForAdmin } from "@/lib/db/guides"
import { formatDateValue } from "@/lib/utils/format"

interface Props {
	query: string
	page: number
}

/**
 * The guides tab: topics first, then the paginated guide list — the same order
 * the public `/guides` index uses.
 *
 * Topics aren't paginated or searched: there are a handful of them, and the
 * search box is scoped to guide title/body, which a topic has no equivalent of.
 * They're hidden while searching so the results aren't padded with rows the
 * query never matched against.
 */
export default async function GuidesTab({ query, page }: Props) {
	const isSearching = query.length > 0
	const [{ guides, totalCount, totalPages }, topics] = await Promise.all([
		listGuidesForAdmin({ query, page }),
		listGuideTopicsForAdmin(),
	])

	const urlForPage = (p: number) =>
		buildAdminPageUrl({ tab: "guides", query, page: p })

	// Captured once so every row on the page agrees about what "now" is.
	const now = new Date()

	return (
		<section className="flex flex-col gap-8">
			{!isSearching && (
				<div>
					<div className="mb-4 flex items-center justify-between">
						<p className="text-secondary text-xs">
							{topics.length} topic{topics.length === 1 ? "" : "s"}
						</p>
						<Link
							href="/admin/guide-topics/new"
							className="text-accent text-sm transition-opacity hover:opacity-75"
						>
							New topic
						</Link>
					</div>

					<div className="divide-border divide-y">
						{topics.map((topic) => (
							<div
								key={topic.id}
								className="flex items-center justify-between gap-3 py-3"
							>
								<div>
									<p className="text-primary text-sm font-medium">
										{topic.title}
									</p>
									<p className="text-secondary mt-0.5 text-xs">
										{topic.projectSlug ?? "no project"} · {topic.guideCount}{" "}
										guide{topic.guideCount === 1 ? "" : "s"}
										{!topic.published && " · Draft"}
									</p>
								</div>
								<Link
									href={`/admin/guide-topics/${topic.id}/edit`}
									prefetch={false}
									className="text-secondary hover:text-primary text-xs transition-colors"
								>
									Edit
								</Link>
							</div>
						))}

						{topics.length === 0 && (
							<p className="text-secondary py-4 text-sm">No topics yet.</p>
						)}
					</div>
				</div>
			)}

			<div>
				<div className="mb-4 flex items-center justify-between">
					<p className="text-secondary text-xs">
						{isSearching
							? `${totalCount} result${totalCount === 1 ? "" : "s"}`
							: `${totalCount} guide${totalCount === 1 ? "" : "s"}`}
					</p>
					<Link
						href="/admin/guides/new"
						className="text-accent text-sm transition-opacity hover:opacity-75"
					>
						New guide
					</Link>
				</div>

				<div className="divide-border divide-y">
					{guides.map((guide) => {
						// Published, but its date hasn't arrived — in the DB, not live.
						const isScheduled =
							guide.published && isScheduledGuide(guide.publishedAt, now)

						return (
							<div
								key={guide.id}
								className="flex items-center justify-between gap-3 py-3"
							>
								<div className="flex items-center gap-3">
									<BooleanFlagToggle
										initial={guide.published}
										url={`/api/admin/guides/${guide.id}`}
										payloadKey="published"
										label="Published"
									/>
									<div>
										<p className="text-primary text-sm font-medium">
											{guide.title}
										</p>
										<p className="text-secondary mt-0.5 text-xs">
											{guide.topic?.title ?? "standalone"} · Updated{" "}
											{formatDateValue(new Date(guide.updatedAt))}
											{!guide.published && " · Draft"}
											{isScheduled && guide.publishedAt && (
												<span className="text-accent">
													{" "}
													· Scheduled for{" "}
													{formatDateValue(new Date(guide.publishedAt))}
												</span>
											)}
										</p>
									</div>
								</div>
								<Link
									href={`/admin/guides/${guide.id}/edit`}
									prefetch={false}
									className="text-secondary hover:text-primary text-xs transition-colors"
								>
									Edit
								</Link>
							</div>
						)
					})}

					{guides.length === 0 && (
						<p className="text-secondary py-4 text-sm">
							{isSearching ? `No results for "${query}".` : "No guides yet."}
						</p>
					)}
				</div>

				<AdminPagination
					page={page}
					totalPages={totalPages}
					urlForPage={urlForPage}
				/>
			</div>
		</section>
	)
}
