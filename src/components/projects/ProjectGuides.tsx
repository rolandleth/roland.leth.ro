"use client"

import { motion } from "framer-motion"
import GuideLinkList from "@/components/guides/GuideLinkList"
import { fadeUp } from "@/lib/client/motion"
import type { GuideLinkItem } from "@/lib/content/guideLinks"

interface Props {
	items: readonly GuideLinkItem[]
	accent: string
}

/**
 * The guides section on a project page: topic hubs and ungrouped guides that
 * name this project. Sits below the content and above the FAQ, mirroring
 * `ProjectFaq`'s structure and accent-coloured heading.
 *
 * Deliberately not in the hero `links` pill row — that row renders accent CTAs
 * with `target="_blank"` for App Store / source links, which is the wrong
 * register for supporting reading material that lives on this same site.
 */
export default function ProjectGuides({ items, accent }: Props) {
	return (
		<motion.section
			className="mt-12"
			aria-labelledby="guides-heading"
			{...fadeUp(0.2)}
		>
			<h2
				id="guides-heading"
				className="mb-4 text-xl font-semibold"
				style={{ color: accent }}
			>
				Guides
			</h2>

			<div className="border-border border-t">
				<GuideLinkList items={items} headingLevel={3} />
			</div>
		</motion.section>
	)
}
