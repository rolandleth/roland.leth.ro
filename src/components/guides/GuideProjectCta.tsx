import Link from "next/link"

interface Props {
	project: { slug: string; name: string; summary: string }
}

/**
 * The product link at the foot of a guide that names a project.
 *
 * Deliberately text-only and deliberately last: these pages earn their traffic
 * by being useful standalone, and an icon-and-button block mid-scroll reads as
 * an ad to exactly the audience they're written for. The name and summary come
 * from the project row, so there's no second copy of the pitch to keep in sync.
 * A guide with no `projectSlug` renders none of this at all.
 */
export default function GuideProjectCta({ project }: Props) {
	return (
		<aside className="border-border mt-12 border-t pt-6">
			<p className="text-secondary mb-2 text-xs tracking-wide uppercase">
				Related project
			</p>

			<h2 className="text-primary mb-1 text-lg font-semibold">
				<Link href={`/projects/${project.slug}`} className="hover:text-accent">
					{project.name}
				</Link>
			</h2>

			<p className="text-secondary text-sm">{project.summary}</p>
		</aside>
	)
}
