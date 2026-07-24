import { afterEach, describe, expect, it, vi } from "vitest"
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
})
