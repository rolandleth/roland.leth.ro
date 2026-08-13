import { afterEach, describe, expect, it, vi } from "vitest"
import {
	defaultOgImage,
	siteOpenGraph,
	siteTwitter,
} from "@/lib/content/metadata"
import { generateMetadata } from "./layout"

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
			images: [defaultOgImage],
		})
		expect(meta.twitter).toEqual({
			...siteTwitter,
			images: [defaultOgImage],
		})
	})

	// The landing page and `not-found` define no `openGraph`, so this object is
	// the only thing standing between the site's most-shared URL and a
	// large-image card with no image in it.
	it("carries the default card for the pages that inherit this object", async () => {
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")

		const meta = await generateMetadata()

		expect(meta.openGraph?.images).toEqual([defaultOgImage])
		expect(meta.twitter?.images).toEqual([defaultOgImage])
	})

	// #endregion
})
