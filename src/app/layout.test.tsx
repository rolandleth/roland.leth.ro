import { isValidElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import MotionPreferences from "@/components/MotionPreferences"
import ThemeProvider from "@/components/ThemeProvider"
import {
	defaultOgImage,
	ogImageEntry,
	siteOpenGraph,
	siteTwitter,
} from "@/lib/content/metadata"
import RootLayout, { generateMetadata } from "./layout"
import type { ElementType, ReactElement, ReactNode } from "react"

// `next/font/google` runs the font loader at module load, which needs the Next
// build pipeline; stub it so the layout module imports under Vitest. The stubbed
// `.variable` values are irrelevant here — only `generateMetadata` is exercised.
vi.mock("next/font/google", () => ({
	Inter: () => ({ variable: "--font-body" }),
	JetBrains_Mono: () => ({ variable: "--font-code" }),
	Newsreader: () => ({ variable: "--font-heading" }),
}))

describe("root layout metadata", () => {
	afterEach(() => {
		vi.unstubAllEnvs()
	})

	it("advertises the tech feed (titled) as the site-wide autodiscovery default", async () => {
		// This inline `alternates` is the fallback feed link for every non-blog
		// page and isn't routed through `buildPageMetadata`, so it needs its own
		// guard: an edit that drops or untitles it would otherwise fail silently.
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		const meta = await generateMetadata()

		expect(meta.alternates?.types?.["application/atom+xml"]).toEqual([
			{ url: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		])
	})

	// #region social card fields

	// The layout's half of the fix. `buildPageMetadata` covers every page that
	// defines its own `openGraph`; this object is what reaches the pages that
	// don't — the landing page, `not-found`, and admin. Nothing else asserts it,
	// and the failure mode is invisible outside a share debugger.
	it("carries the site-wide OG fields for pages that define no openGraph", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		const meta = await generateMetadata()

		expect(meta.openGraph).toMatchObject(siteOpenGraph)
	})

	it("carries the site-wide Twitter fields for pages that define no twitter", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		const meta = await generateMetadata()

		expect(meta.twitter).toMatchObject(siteTwitter)
	})

	// Pins the shared-constant wiring, not just the values: two literal copies
	// that happen to match today would satisfy `toMatchObject` above and then
	// drift the next time one side is edited.
	it("spreads the shared constants rather than restating them", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		const meta = await generateMetadata()

		expect(meta.openGraph).toEqual({
			...siteOpenGraph,
			type: "website",
			images: [ogImageEntry(defaultOgImage)],
		})
		expect(meta.twitter).toEqual({
			...siteTwitter,
			images: [ogImageEntry(defaultOgImage)],
		})
	})

	// The landing page and `not-found` define no `openGraph`, so this object is
	// the only thing standing between the site's most-shared URL and a
	// large-image card with no image in it.
	it("carries the default card for the pages that inherit this object", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		const meta = await generateMetadata()

		expect(meta.openGraph?.images).toEqual([ogImageEntry(defaultOgImage)])
		expect(meta.twitter?.images).toEqual([ogImageEntry(defaultOgImage)])
	})

	// #endregion
})

/** The `children` of a React element, or null when it has none. */
function childrenOf(element: ReactElement): ReactNode {
	// `ReactElement`'s props are `unknown` by default, and every element here is
	// one the layout itself wrote — there is nothing to narrow against.
	const { children } = element.props as { children?: ReactNode }

	return children ?? null
}

/** Depth-first search for the first element of `type` in a rendered tree. */
function findElement(node: ReactNode, type: ElementType): ReactElement | null {
	if (Array.isArray(node)) {
		for (const child of node) {
			const match = findElement(child, type)

			if (match) {
				return match
			}
		}

		return null
	}

	if (!isValidElement(node)) {
		return null
	}

	if (node.type === type) {
		return node
	}

	return findElement(childrenOf(node), type)
}

describe("root layout providers", () => {
	// `MotionPreferences` only does its job for what it wraps, and the whole app
	// is what needs wrapping. Asserted on the element tree rather than a render:
	// the wiring is the part that can silently disappear, and rendering the real
	// layout would drag in the header, footer, and analytics for no added signal.
	it("wraps the app in MotionPreferences", () => {
		const tree = RootLayout({ children: <div /> })

		expect(findElement(tree, MotionPreferences)).not.toBeNull()
	})

	// Not a style preference — a component rendered outside the provider keeps
	// animating through the OS preference. Pinning the nesting means moving a
	// provider above `MotionPreferences` has to be a deliberate edit.
	it("nests every other provider inside it", () => {
		const tree = RootLayout({ children: <div /> })
		const motionPreferences = findElement(tree, MotionPreferences)
		const nested = motionPreferences
			? findElement(childrenOf(motionPreferences), ThemeProvider)
			: null

		expect(nested).not.toBeNull()
	})
})
