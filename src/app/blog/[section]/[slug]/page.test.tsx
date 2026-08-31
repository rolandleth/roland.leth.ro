import { render } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { loadPost, loadScheduledPost } from "@/lib/db/posts"
import PostPage, { generateMetadata } from "./page"

vi.mock("@/lib/db/posts", () => ({
	getAllPublishedPostSlugs: vi.fn().mockResolvedValue([]),
	loadPost: vi.fn(),
	loadScheduledPost: vi.fn(),
}))

vi.mock("next/navigation", () => ({
	notFound: vi.fn(() => {
		throw new Error("NOT_FOUND")
	}),
	permanentRedirect: vi.fn((url: string) => {
		throw new Error(`REDIRECT:${url}`)
	}),
}))

vi.mock("@/components/blog/PostContent", () => ({
	default: function MockPostContent() {
		return null
	},
}))

vi.mock("@/components/blog/PostMarkdownContent", () => ({
	default: function MockPostMarkdownContent() {
		return null
	},
}))

function paramsFor(section: string, slug: string) {
	return { params: Promise.resolve({ section, slug }) }
}

const existingPost = {
	id: 1,
	title: "Hello",
	body: "Content",
	section: "tech" as const,
	datetime: "2025-01-01-1200",
	published: true,
	summary: "Content",
	imageUrl: null,
	readingTime: null,
	slug: "hello",
	createdAt: new Date(),
	updatedAt: new Date(),
}

beforeEach(() => {
	vi.resetAllMocks()
})

describe("PostPage", () => {
	it("calls notFound for an invalid section", async () => {
		await expect(PostPage(paramsFor("garbage", "hello"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("calls notFound when the post does not exist", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		await expect(PostPage(paramsFor("tech", "missing"))).rejects.toThrow(
			"NOT_FOUND"
		)
	})

	it("308-redirects a renamed legacy slug to its canonical form", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		await expect(
			PostPage(paramsFor("tech", "final-version--for-now-"))
		).rejects.toThrow("REDIRECT:/blog/tech/final-version-for-now")
	})

	it("does not redirect an alias hit whose section differs from the URL", async () => {
		// `final-version--for-now-` is a tech alias; requested under life it must
		// 404, not cross-redirect into tech.
		vi.mocked(loadPost).mockResolvedValue(null)
		await expect(
			PostPage(paramsFor("life", "final-version--for-now-"))
		).rejects.toThrow("NOT_FOUND")
	})

	it("renders the scheduled notice with a title tease for a future-dated post", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		vi.mocked(loadScheduledPost).mockResolvedValue({
			title: "Hello",
			datetime: "2999-01-01-0900",
		})

		const { container } = render(await PostPage(paramsFor("tech", "hello")))

		expect(container.textContent).toContain("Hello")
		expect(container.textContent).toContain("isn’t live yet")
		expect(container.textContent).toContain("Jan 1, 2999")
	})

	it("still 308-redirects an aliased slug even when its post is scheduled", async () => {
		// Alias check runs before the scheduled check, so the notice renders on
		// the canonical URL, never the dirty legacy one.
		vi.mocked(loadPost).mockResolvedValue(null)
		vi.mocked(loadScheduledPost).mockResolvedValue({
			title: "Hello",
			datetime: "2999-01-01-0900",
		})

		await expect(
			PostPage(paramsFor("tech", "final-version--for-now-"))
		).rejects.toThrow("REDIRECT:/blog/tech/final-version-for-now")
	})

	it("renders when both section and post are valid", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const result = await PostPage(paramsFor("tech", "hello"))
		expect(result).toBeDefined()
	})

	it("emits BlogPosting JSON-LD for the post", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)

		const { container } = render(await PostPage(paramsFor("tech", "hello")))
		const script = container.querySelector('script[type="application/ld+json"]')
		const jsonLd = JSON.parse(script?.innerHTML ?? "{}")

		expect(jsonLd["@type"]).toBe("BlogPosting")
		expect(jsonLd.headline).toBe("Hello")
		expect(jsonLd.url).toBe("https://roland.leth.ro/blog/tech/hello")
	})

	it("escapes a `</script>` payload in the title so it can't break out of the JSON-LD block", async () => {
		vi.mocked(loadPost).mockResolvedValue({
			...existingPost,
			title: "Pwn</script><img src=x onerror=alert(1)>",
		})

		const { container } = render(await PostPage(paramsFor("tech", "hello")))
		const script = container.querySelector('script[type="application/ld+json"]')
		const raw = script?.innerHTML ?? ""

		// The literal closing tag must never reach the HTML, but the escaped form
		// must still parse back to the original title.
		expect(raw).not.toContain("</script>")
		expect(raw).toContain("\\u003c/script\\u003e")
		expect(JSON.parse(raw).headline).toBe(
			"Pwn</script><img src=x onerror=alert(1)>"
		)
	})
})

describe("generateMetadata", () => {
	it("returns empty metadata for an invalid section (so the page itself can 404)", async () => {
		const result = await generateMetadata(paramsFor("garbage", "hello"))
		expect(result).toEqual({})
	})

	it("returns empty metadata when the post does not exist", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		const result = await generateMetadata(paramsFor("tech", "missing"))
		expect(result).toEqual({})
	})

	it("returns noindex title-only metadata for a scheduled post", async () => {
		vi.mocked(loadPost).mockResolvedValue(null)
		vi.mocked(loadScheduledPost).mockResolvedValue({
			title: "Hello",
			datetime: "2999-01-01-0900",
		})

		const result = await generateMetadata(paramsFor("tech", "hello"))

		expect(result.title).toBe("Hello")
		expect(result.robots).toEqual({ index: false })
		expect(result.openGraph).toBeUndefined()
	})

	it("returns title + article metadata for a valid post", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const result = await generateMetadata(paramsFor("tech", "hello"))
		expect(result.title).toBe("Hello")
		// `Metadata.openGraph` is a discriminated union; cast to read the
		// type discriminator without narrowing in the test.
		const og = result.openGraph as { type?: string } | undefined
		expect(og?.type).toBe("article")
	})

	it("advertises the .md alternate so crawlers can discover the raw markdown", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const result = await generateMetadata(paramsFor("tech", "hello"))
		expect(result.alternates?.types?.["text/markdown"]).toBe(
			"/blog/tech/hello.md"
		)
	})

	it("advertises the section's feed (titled) for autodiscovery from a post page", async () => {
		vi.mocked(loadPost).mockResolvedValue(existingPost)
		const result = await generateMetadata(paramsFor("tech", "hello"))
		expect(result.alternates?.types?.["application/atom+xml"]).toEqual([
			{ url: "/blog/tech/feed.xml", title: "Roland Leth — Tech blog" },
		])
	})
})
