"use client"

import { motion } from "framer-motion"
import { fadeUp } from "@/lib/client/motion"

interface Props {
	/** Rendered inside the animated `<header>`: the title, dateline, and any breadcrumb. */
	header: React.ReactNode
	children: React.ReactNode
}

/**
 * The shared long-form article shell — a centered prose column with an animated
 * header and body. Blog posts and guides both render through it so the two
 * surfaces can't drift apart on column width, rhythm, or entrance animation.
 *
 * The header content is passed in rather than parameterized: a post's header
 * shows a publication date, a guide's shows its parent topic and an "Updated"
 * dateline, and a props-per-variant shell would grow a flag per surface.
 */
export default function ProseShell({ header, children }: Props) {
	return (
		<article className="mx-auto w-full max-w-3xl px-4 py-12">
			<motion.header className="mb-10" {...fadeUp(0)}>
				{header}
			</motion.header>

			<motion.div {...fadeUp(0.1)}>{children}</motion.div>
		</article>
	)
}
