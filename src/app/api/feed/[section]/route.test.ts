import { unstable_cache } from "next/cache"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { markdownToHtml } from "@/lib/content/markdown"
import { prisma } from "@/lib/db/db"
import { GET } from "./route"

// Spy variant so we can assert on the cache keys and tags wired to each
// section. The identity-passthrough factory used elsewhere doesn't capture
// the args, so tag renames would otherwise slip through undetected.
vi.mock("next/cache", async () => {
	const { nextCacheSpyFactory } = await import("@/test/mocks/nextCache")

	return nextCacheSpyFactory()
})

vi.mock("@/lib/db/db", () => ({
	prisma: { post: { findMany: vi.fn(), count: vi.fn() } },
}))

vi.mock("@/lib/content/markdown", () => ({
	markdownToHtml: vi.fn(async (md: string) => `<p>${md}</p>`),
}))

function makeRequest(section: string) {
	return [
		new Request(`http://localhost/api/feed/${section}`),
		{ params: Promise.resolve({ section }) },
	] as const
}

const basePost = {
	id: 1,
	title: "Test Post",
	slug: "test-post",
	section: "tech" as const,
	datetime: "2024-01-01-0900",
	body: "Some content.",
	summary: "A short summary.",
	imageUrl: null,
	readingTime: null,
	published: true,
	createdAt: new Date("2024-01-01T09:00:00.000Z"),
	updatedAt: new Date("2024-01-01T09:00:00.000Z"),
}

// `makeFeedPostsCache` runs once per section at module load (via `bySection`),
// so capture the `unstable_cache` call args here before `beforeEach`'s
// `resetAllMocks` wipes them.
const unstableCacheCallsAtModuleLoad = vi
	.mocked(unstable_cache)
	.mock.calls.slice()

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(markdownToHtml).mockImplementation(async (md) => `<p>${md}</p>`)
	vi.mocked(prisma.post.findMany).mockResolvedValue([])
	vi.mocked(prisma.post.count).mockResolvedValue(0)
	vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost")
})

describe("GET /api/feed/:section", () => {
	it("returns 404 for an invalid section", async () => {
		const response = await GET(...makeRequest("invalid"))
		expect(response.status).toBe(404)
	})

	it("returns 200 with Atom XML content type for a valid section", async () => {
		const response = await GET(...makeRequest("tech"))
		expect(response.status).toBe(200)
		expect(response.headers.get("Content-Type")).toContain(
			"application/atom+xml"
		)
	})

	it("includes the feed title, self link, and blog link", async () => {
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<title>Roland Leth — Tech blog</title>")
		expect(text).toContain('href="http://localhost/api/feed/tech" rel="self"')
		expect(text).toContain('href="http://localhost/blog/tech"')
	})

	it("carries the feed-level author, subtitle, icon and rights", async () => {
		// RFC 4287 §4.1.1 requires a feed-level `<author>` when entries omit their
		// own; without it the whole document is invalid and strict readers reject
		// it. Subtitle/icon/rights restore parity with the pre-Next feed.
		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		expect(text).toContain("<name>Roland Leth</name>")
		expect(text).toContain(
			"<subtitle>Software development thoughts by Roland Leth</subtitle>"
		)
		expect(text).toContain(
			"<icon>http://localhost/images/favicons/192x192.png</icon>"
		)
		expect(text).toContain("<rights>Copyright (c) 2013–")
	})

	it("uses a section-specific subtitle for the life feed", async () => {
		const text = await GET(...makeRequest("life")).then((r) => r.text())
		expect(text).toContain(
			"<subtitle>Personal development thoughts by Roland Leth</subtitle>"
		)
	})

	it("includes all required Atom entry elements", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		expect(text).toContain("<title>Test Post</title>")
		expect(text).toContain('href="http://localhost/blog/tech/test-post"')
		expect(text).toContain("<published>")
		// Shape-only: entry `<updated>` is `max(published, updatedAt)` and
		// `published` is derived from a local-time `Date`, so the exact instant is
		// zone-dependent. Asserting the ISO shape keeps this TZ-robust (the
		// scheduled-post test below pins the max semantics with unambiguous dates).
		expect(text).toMatch(
			/<updated>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z<\/updated>/
		)
		expect(text).toContain("<summary>")
		expect(text).toContain('<content type="html">')
	})

	it("uses the DB summary field when present", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<summary>A short summary.</summary>")
	})

	it("renders the post body as HTML in the content element", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain(
			'<content type="html"><![CDATA[<p>Some content.</p>]]></content>'
		)
	})

	it("escapes XML-special characters in post titles", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ ...basePost, title: "A & <B>" },
		])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<title>A &amp; &lt;B&gt;</title>")
	})

	it("sets feed <updated> to the most recent post updatedAt", async () => {
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{ ...basePost, updatedAt: new Date("2024-03-01T00:00:00.000Z") },
			{ ...basePost, updatedAt: new Date("2024-06-01T00:00:00.000Z") },
			{ ...basePost, updatedAt: new Date("2024-01-01T00:00:00.000Z") },
		])
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<updated>2024-06-01T00:00:00.000Z</updated>")
	})

	it("advances feed <updated> to a scheduled post's publish time, not its older edit time", async () => {
		// A scheduled post is authored days before it publishes, so its `updatedAt`
		// (the edit) predates publication. Keying the feed's `<updated>` off
		// `updatedAt` alone froze it in the reader's past the moment the post went
		// live, so readers polling conditionally never refetched and never saw the
		// new post. `<updated>` must track the later publish time instead.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{
				...basePost,
				datetime: "2024-07-15-1200",
				updatedAt: new Date("2024-01-01T00:00:00.000Z"),
			},
		])

		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		// Publication (July) wins over the January edit. Midday keeps the calendar
		// day within July across every real zone; the exact instant isn't asserted.
		expect(text).toMatch(/<updated>2024-07-1[456]T/)
		expect(text).not.toContain("2024-01-01T00:00:00.000Z")
	})

	it("returns a valid feed with no entries when there are no posts", async () => {
		const text = await GET(...makeRequest("tech")).then((r) => r.text())
		expect(text).toContain("<feed")
		expect(text).not.toContain("<entry>")
	})

	it("wires per-section cache keys and tags through unstable_cache", () => {
		// The cache key `feed-posts-${section}` and tag `feed-${section}` are
		// the contract between the feed route and `revalidatePostSection`; a
		// silent rename on either side would break invalidation undetected.
		// Calls happen at module load via `bySection`, so we read the snapshot
		// captured before `beforeEach`'s reset.
		const keys = unstableCacheCallsAtModuleLoad.map((call) => call[1])
		const tagSets = unstableCacheCallsAtModuleLoad.map((call) => call[2]?.tags)

		expect(keys).toEqual(
			expect.arrayContaining([["feed-posts-tech"], ["feed-posts-life"]])
		)
		expect(tagSets).toEqual(
			expect.arrayContaining([["feed-tech"], ["feed-life"]])
		)
	})

	it("uses getSiteUrl() rather than request.url for the canonical origin", async () => {
		// Feed readers key entries on `<id>`; a regression to `request.url` would
		// make preview/proxy hosts emit different IDs for the same entry.
		vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://roland.leth.ro")
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])

		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		expect(text).toContain(
			'href="https://roland.leth.ro/api/feed/tech" rel="self"'
		)
		expect(text).toContain(
			"<id>https://roland.leth.ro/blog/tech/test-post</id>"
		)
		expect(text).not.toContain("http://localhost")
	})

	it("escapes the CDATA terminator inside rendered HTML so the feed stays well-formed", async () => {
		// A body whose rendered HTML contains the literal `]]>` sequence would
		// otherwise close the `<content>` CDATA section early and break the XML.
		vi.mocked(markdownToHtml).mockResolvedValueOnce("<p>before]]>after</p>")
		vi.mocked(prisma.post.findMany).mockResolvedValue([basePost])

		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		// Raw `]]>` must not appear inside the CDATA payload; the canonical split
		// swaps it for `]]]]><![CDATA[>` which XML parsers recombine safely.
		expect(text).toContain(
			"<![CDATA[<p>before]]]]><![CDATA[>after</p>]]></content>"
		)
	})

	it("falls back to updatedAt for <published> when post.datetime is malformed", async () => {
		// `postDatetimeToISO` returns `undefined` (not `null`) for legacy DB
		// rows whose `datetime` doesn't match the schema regex. The whole point
		// of the `undefined`-not-throw contract is so this feed-route fallback
		// can exist; a missing fallback would surface `<published>null</published>`
		// or worse `<published>undefined</published>` to strict readers.
		//
		// The datetime must still be lex-`<=` the current time so the
		// scheduled-post read-time filter doesn't exclude the row before this
		// rendering fallback is exercised. `"2020-bad-format"` is past-lex
		// (`"2020"` < the current year prefix) and fails the `yyyy-MM-dd`
		// / `yyyy-MM-dd-HHmm` regex so `postDatetimeToISO` returns
		// `undefined`.
		vi.mocked(prisma.post.findMany).mockResolvedValue([
			{
				...basePost,
				datetime: "2020-bad-format",
				updatedAt: new Date("2024-07-15T12:34:56.000Z"),
			},
		])

		const text = await GET(...makeRequest("tech")).then((r) => r.text())

		expect(text).toContain("<published>2024-07-15T12:34:56.000Z</published>")
		expect(text).not.toContain("<published>null</published>")
		expect(text).not.toContain("<published>undefined</published>")
	})
})
