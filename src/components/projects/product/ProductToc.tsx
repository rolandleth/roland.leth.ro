"use client"

import { ArrowUp } from "lucide-react"
import { useEffect, useState } from "react"
import { MAIN_CONTENT_ID } from "@/lib/client/navigation"
import type { MouseEvent } from "react"

export interface TocItem {
	/** The target's element id. */
	id: string
	title: string
}

interface Props {
	items: readonly TocItem[]
}

// The band of the viewport that decides the "current" section: a section counts
// once its top passes 30% from the top, until its end leaves the top 40%.
const ACTIVE_BAND = "-30% 0px -60% 0px"

// Where the rail shows: the `min-[1080px]:block` on the `nav` below. Below it
// the rail is `display: none`, so nothing is observed there.
const RAIL_MEDIA_QUERY = "(min-width: 1080px)"

/**
 * The section list on a long product page, from 1080px up: sticky beside the
 * content, with the section in view marked (`aria-current`) as the reader
 * scrolls, and a way back to the top under it. Narrower screens get
 * `ProductTocCompact` instead.
 *
 * The marked entry is the first, in list order, of the sections in the band.
 * With none there (the hero above the sections, the closing below the FAQ),
 * nothing is marked, as at load.
 *
 * Without JavaScript it's a plain list of in-page links; the marker is the
 * only part that needs the observer, and "Back to top" falls back to the skip
 * link's target.
 */
export function ProductToc({ items }: Props) {
	const [activeId, setActiveId] = useState<string | null>(null)

	useEffect(() => {
		const railQuery = window.matchMedia(RAIL_MEDIA_QUERY)
		// The ids in the band now. An observer callback reports only the entries
		// that changed, so the set carries the rest between calls.
		const inBand = new Set<string>()
		let observer: IntersectionObserver | null = null

		function observe() {
			const targets = items
				.map((item) => document.getElementById(item.id))
				.filter((element): element is HTMLElement => element != null)

			if (targets.length === 0) {
				return
			}

			observer = new IntersectionObserver(
				(entries) => {
					for (const entry of entries) {
						if (entry.isIntersecting) {
							inBand.add(entry.target.id)
						} else {
							inBand.delete(entry.target.id)
						}
					}

					setActiveId(firstInBand(items, inBand))
				},
				{ rootMargin: ACTIVE_BAND }
			)
			targets.forEach((target) => observer?.observe(target))
		}

		function stopObserving() {
			observer?.disconnect()
			observer = null
			inBand.clear()
			setActiveId(null)
		}

		// Only a change of side starts or stops the observer: the rail appears
		// (a window widened past 1080px) or goes (narrowed below it).
		function followRail() {
			if (railQuery.matches) {
				observe()
			} else {
				stopObserving()
			}
		}

		if (railQuery.matches) {
			observe()
		}

		railQuery.addEventListener("change", followRail)

		return () => {
			railQuery.removeEventListener("change", followRail)
			observer?.disconnect()
		}
	}, [items])

	return (
		// `self-start`: a grid item stretches to the row's full height by
		// default, which leaves a sticky element no room to stick, so it scrolled
		// away with the page. The header's height as `top` keeps it below the
		// fixed site header. `pb-12` matches the top: a sticky element stops at
		// its column's end, so without it the last entry touched the closing band
		// as that scrolled in.
		<nav
			aria-label="On this page"
			className="sticky top-(--site-header-height) hidden self-start pt-12 pb-12 min-[1080px]:block"
		>
			<p className="text-primary mb-2.5 text-[13px] font-semibold">
				On this page
			</p>

			<ol role="list" className="border-l border-(--color-border)">
				{items.map((item) => {
					const isActive = item.id === activeId

					return (
						<li key={item.id}>
							<a
								href={`#${item.id}`}
								aria-current={isActive ? "true" : undefined}
								className={`-ml-px block border-l-2 py-1.5 pl-3.5 text-[13.5px] leading-snug no-underline transition-colors duration-200 ${
									isActive
										? "text-primary border-(--product-accent-text) font-medium"
										: "text-secondary hover:text-primary border-transparent"
								}`}
							>
								{item.title}
							</a>
						</li>
					)
				})}
			</ol>

			<a
				href={`#${MAIN_CONTENT_ID}`}
				onClick={scrollToTop}
				className="text-secondary hover:text-primary mt-5 inline-flex items-center gap-1.5 text-[13px] no-underline transition-colors duration-200"
			>
				<ArrowUp aria-hidden size={14} />
				Back to top
			</a>
		</nav>
	)
}

/** The first entry, in list order, whose section is in the band; null for none. */
function firstInBand(
	items: readonly TocItem[],
	inBand: ReadonlySet<string>
): string | null {
	return items.find((item) => inBand.has(item.id))?.id ?? null
}

/**
 * Scrolls to the very top, above the hero, rather than to `<main>` as the bare
 * link would; smooth or not by the page's own `scroll-behavior`, so readers who
 * ask for less motion get a jump. It also drops the `#section` a rail click left
 * in the URL, or a reload would land back on that section. The entry is
 * replaced, not added, so Back doesn't return to the top first. Focus moves to
 * `<main>` (focusable through its `tabIndex={-1}`), as the skip link moves it,
 * so the next Tab starts from the top.
 */
function scrollToTop(event: MouseEvent<HTMLAnchorElement>) {
	event.preventDefault()
	window.scrollTo({ top: 0 })

	const { pathname, search } = window.location
	window.history.replaceState(window.history.state, "", `${pathname}${search}`)
	document.getElementById(MAIN_CONTENT_ID)?.focus({ preventScroll: true })
}

/**
 * The same list below 1080px, collapsed under the hero so a phone reader can
 * jump without scrolling past twelve sections. Native `<details>`, so it works
 * without JavaScript and keeps its links in the HTML.
 */
export function ProductTocCompact({ items }: Props) {
	return (
		<details className="group border-b border-(--color-border) py-4 min-[1080px]:hidden">
			<summary className="text-primary flex cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
				On this page
				<span
					aria-hidden
					className="text-(--product-accent-text) transition-transform duration-200 group-open:rotate-45"
				>
					+
				</span>
			</summary>

			<ol role="list" className="mt-3 flex flex-col">
				{items.map((item) => (
					<li key={item.id}>
						<a
							href={`#${item.id}`}
							className="text-secondary hover:text-primary block py-1.5 text-sm no-underline"
						>
							{item.title}
						</a>
					</li>
				))}
			</ol>
		</details>
	)
}
