import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { verifySession } from "@/lib/auth/auth"
import { requireAdminPageSession } from "@/lib/auth/middlewareBypass"
import { loadPostRowResolution } from "@/lib/db/posts"
import OverridePreviewPage, { dynamic, generateMetadata } from "./page"

vi.mock("@/lib/db/posts", () => ({
	loadPostRowResolution: vi.fn(),
}))

// Neither module is imported by the route, and mocking them anyway is the
// point: it turns "this route has no auth gate" from something that happens to
// be true into something a test can watch. Add a session call to the page and
// these spies start registering it.
vi.mock("@/lib/auth/auth", () => ({
	verifySession: vi.fn(),
}))

vi.mock("@/lib/auth/middlewareBypass", () => ({
	requireAdminPageSession: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
	redirect: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`)
	}),
}))

vi.mock("@/components/blog/PostMarkdownContent", () => ({
	default: function MockPostMarkdownContent({ content }: { content: string }) {
		return <div>{content}</div>
	},
}))

function paramsFor(section: string, slug: string) {
	return { params: Promise.resolve({ section, slug }) }
}

const existingPost = {
	id: 1,
	title: "Hello",
	body: "Body content.",
	section: "tech" as const,
	datetime: "2999-01-01-0900",
	summary: "A short summary.",
	imageUrl: null,
	readingTime: null,
	slug: "hello",
	updatedAt: new Date(),
}

const MISSING = { status: "missing" } as const

function scheduled(post: typeof existingPost = existingPost) {
	return { status: "scheduled", post } as const
}

function live(post: typeof existingPost = existingPost) {
	return { status: "live", post } as const
}

beforeEach(() => {
	vi.resetAllMocks()
	// The hostile default: a session gate added here would SUCCEED and render
	// normally, so nothing incidental fails. That leaves the explicit
	// not-called assertions as the only thing standing between a future auth
	// check and a green suite.
	vi.mocked(verifySession).mockResolvedValue(true)
	vi.mocked(requireAdminPageSession).mockResolvedValue(undefined)
	vi.spyOn(console, "info").mockImplementation(() => {})
})

describe("route config", () => {
	it("stays force-dynamic, which is what makes the live redirect reachable", () => {
		// Not decoration. This route reads no cookie and no header, so without
		// the flag Next serves it from the full route cache after one render and
		// the live-yet verdict freezes — the preview would keep serving a post
		// that has since gone live instead of redirecting to it. Nothing else
		// opts the route out, and no tag busts when a `datetime` merely passes.
		expect(dynamic).toBe("force-dynamic")
	})
})

describe("OverridePreviewPage", () => {
	it("calls notFound for an invalid section", async () => {
		await expect(
			OverridePreviewPage(paramsFor("garbage", "hello"))
		).rejects.toThrow("NOT_FOUND")
	})

	it("serves the body with no session, which is the point of the URL", async () => {
		// The route is public by decision, not by oversight: the URL itself is
		// the override, so a preview link works for someone with no account.
		// Anything that reintroduces an auth check fails here — the spies, not
		// the render, are what enforce that, since a working gate would render
		// the body just fine.
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		const { container } = render(
			await OverridePreviewPage(paramsFor("tech", "hello"))
		)

		expect(container.textContent).toContain("Body content.")
		expect(verifySession).not.toHaveBeenCalled()
		expect(requireAdminPageSession).not.toHaveBeenCalled()
	})

	it("consults no session on the way to a 404 either", async () => {
		// The missing-post path is the one an enumerator hits, and it must stay
		// as anonymous as the success path — an auth check there would turn a
		// probe into a login redirect and change what the URL tells a guesser.
		vi.mocked(loadPostRowResolution).mockResolvedValue(MISSING)

		await expect(
			OverridePreviewPage(paramsFor("tech", "missing"))
		).rejects.toThrow("NOT_FOUND")

		expect(verifySession).not.toHaveBeenCalled()
		expect(requireAdminPageSession).not.toHaveBeenCalled()
	})

	it("logs the section and slug whenever it serves a scheduled body", async () => {
		// The route's only trace. Access control is the URL, so this line is the
		// whole of what answers "did anyone other than me open it?" — see the
		// watch-out in `dev-journal/2026-09-03.md`.
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		render(await OverridePreviewPage(paramsFor("tech", "hello")))

		expect(console.info).toHaveBeenCalledWith(
			"[blog:override-preview] scheduled body served",
			{ section: "tech", slug: "hello" }
		)
	})

	it("logs nothing when it redirects a post that has gone live", async () => {
		// A redirect discloses no body, so it isn't the event worth watching;
		// logging it would bury the one that is under bot traffic.
		vi.mocked(loadPostRowResolution).mockResolvedValue(
			live({ ...existingPost, datetime: "2024-06-01-1200" })
		)

		await expect(
			OverridePreviewPage(paramsFor("tech", "hello"))
		).rejects.toThrow("REDIRECT:")

		expect(console.info).not.toHaveBeenCalled()
	})

	it("calls notFound when the post does not exist", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(MISSING)

		await expect(
			OverridePreviewPage(paramsFor("tech", "missing"))
		).rejects.toThrow("NOT_FOUND")
	})

	it("renders a scheduled post's body", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		const { container } = render(
			await OverridePreviewPage(paramsFor("tech", "hello"))
		)

		expect(container.textContent).toContain("Hello")
		expect(container.textContent).toContain("Body content.")
	})

	it("shows the post's own future date, which is what marks it as unpublished", async () => {
		// Deliberately no preview banner: `PostContent`'s date subtitle carries
		// the signal, so a date in the future is the only thing distinguishing
		// this from the live page.
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		const { container } = render(
			await OverridePreviewPage(paramsFor("tech", "hello"))
		)

		expect(container.textContent).toContain("Jan 1, 2999")
	})

	it("emits no BlogPosting JSON-LD for a post that isn't out yet", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		const { container } = render(
			await OverridePreviewPage(paramsFor("tech", "hello"))
		)

		expect(
			container.querySelector('script[type="application/ld+json"]')
		).toBeNull()
	})

	it("307-redirects to the canonical URL once the post is live", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(
			live({ ...existingPost, datetime: "2024-06-01-1200" })
		)

		await expect(
			OverridePreviewPage(paramsFor("tech", "hello"))
		).rejects.toThrow("REDIRECT:/blog/tech/hello")
	})
})

describe("generateMetadata", () => {
	it("returns empty metadata for an invalid section (so the page itself can 404)", async () => {
		const result = await generateMetadata(paramsFor("garbage", "hello"))

		expect(result).toEqual({})
	})

	it("returns empty metadata when the post does not exist", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(MISSING)

		const result = await generateMetadata(paramsFor("tech", "missing"))

		expect(result).toEqual({})
	})

	it("returns noindex, nofollow metadata for a scheduled post", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		const result = await generateMetadata(paramsFor("tech", "hello"))

		expect(result.title).toBe("Hello")
		expect(result.robots).toEqual({ index: false, follow: false })
	})

	it("stays noindex for a post that has gone live", async () => {
		// The page redirects that case, but `generateMetadata` runs independently
		// of the body: if the redirect ever regressed, this URL still must not
		// become an indexable duplicate of the post.
		vi.mocked(loadPostRowResolution).mockResolvedValue(
			live({ ...existingPost, datetime: "2024-06-01-1200" })
		)

		const result = await generateMetadata(paramsFor("tech", "hello"))

		expect(result.robots).toEqual({ index: false, follow: false })
	})

	it("advertises the post's OWN section feed on a life preview", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(
			scheduled({ ...existingPost, section: "life" as unknown as "tech" })
		)

		const result = await generateMetadata(paramsFor("life", "hello"))

		expect(result.alternates?.types?.["application/atom+xml"]).toEqual([
			{ url: "/blog/life/feed.xml", title: "Roland Leth — Life blog" },
		])
	})

	it("omits the .md alternate, whose twin still serves the scheduled stub", async () => {
		vi.mocked(loadPostRowResolution).mockResolvedValue(scheduled())

		const result = await generateMetadata(paramsFor("tech", "hello"))

		expect(result.alternates?.types?.["text/markdown"]).toBeUndefined()
	})
})
