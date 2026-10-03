import { describe, expect, it } from "vitest"
import { markdownToHtml } from "@/lib/content/markdown"
import {
	localMediaPaths,
	localMediaSkipReason,
	mediaFileProblem,
	orphanedPostMedia,
	postMediaKeyFor,
	postMediaPrefixFor,
	postMediaSectionPrefix,
	rewriteLocalMedia,
	scanLocalMedia,
} from "@/lib/import/postMedia"
import { isVideoUrl, MAX_VIDEO_UPLOAD_BYTES } from "@/lib/utils/video"
import { ebmlHeader, ftypBox } from "@/test/mediaBytes"
import type { ListedBlob } from "@/lib/import/blobSync"

const STORE = "https://store.public.blob.vercel-storage.com"

/** The scan's references, failing the test when the scan itself failed. */
function refsOf(body: string) {
	const scan = scanLocalMedia(body)

	if (!scan.ok) {
		throw new Error(`Scan failed: ${scan.reason}`)
	}

	return scan.refs
}

/** Scans `body` and rewrites every local path to `<STORE>/<path>`. */
function rewrite(body: string): string {
	const refs = refsOf(body)
	const urlByPath = new Map(
		localMediaPaths(refs).map((path) => [path, `${STORE}/${path}`])
	)

	return rewriteLocalMedia(body, refs, urlByPath)
}

function blob(pathname: string): ListedBlob {
	return {
		pathname,
		url: `${STORE}/${pathname}`,
		size: 1024,
		uploadedAt: new Date("2026-10-01T00:00:00.000Z"),
	}
}

// #region scanLocalMedia

describe("scanLocalMedia", () => {
	it("finds an inline image with a relative path", () => {
		expect(localMediaPaths(refsOf("![Shot](media/post/shot.png)"))).toEqual([
			"media/post/shot.png",
		])
	})

	it("finds a video, which is image syntax too", () => {
		expect(localMediaPaths(refsOf("![Demo](media/post/demo.mp4)"))).toEqual([
			"media/post/demo.mp4",
		])
	})

	it("reports where the destination sits in the body", () => {
		const body = "Intro.\n\n![Shot](media/shot.png)\n\nOutro."
		const [ref] = refsOf(body)

		expect(body.slice(ref.start, ref.end)).toBe("media/shot.png")
	})

	it("finds nothing in a body with no images", () => {
		expect(refsOf("Just text and a [link](other.md).")).toEqual([])
	})

	it.each([
		["an https URL", "![a](https://example.com/a.png)"],
		["an http URL", "![a](http://example.com/a.png)"],
		["a site-relative path", "![a](/images/post/a.png)"],
		["a protocol-relative URL", "![a](//cdn.example.com/a.png)"],
		["a data URI", "![a](data:image/png;base64,AAAA)"],
		["an empty destination", "![a]()"],
	])("leaves %s alone", (_label, body) => {
		expect(refsOf(body)).toEqual([])
	})

	it("never treats a link as media, even one to a media file", () => {
		expect(refsOf("[Download](media/demo.mp4)")).toEqual([])
	})

	it("ignores image syntax inside a fenced code block and inline code", () => {
		const body =
			"```md\n![a](media/a.png)\n```\n\nUse `![b](media/b.png)` here."

		expect(refsOf(body)).toEqual([])
	})

	it("finds an image nested in a list, a blockquote and a link", () => {
		const body =
			"- ![a](media/a.png)\n\n> ![b](media/b.png)\n\n[![c](media/c.png)](https://example.com)"

		expect(localMediaPaths(refsOf(body))).toEqual([
			"media/a.png",
			"media/b.png",
			"media/c.png",
		])
	})

	// Each: the path to read from disk, and the text in the body that the
	// rewrite replaces.
	it.each([
		{
			label: "finds the definition a reference-style image points at",
			body: "![Shot][shot]\n\n[shot]: media/shot.png",
			path: "media/shot.png",
			written: "media/shot.png",
		},
		{
			label: "decodes a percent-encoded path to the name on disk",
			body: "![a](media/my%20shot.png)",
			path: "media/my shot.png",
			written: "media/my%20shot.png",
		},
		{
			label: "reads the angle-bracket form, spaces included",
			body: "![a](<media/my shot.png>)",
			path: "media/my shot.png",
			written: "media/my shot.png",
		},
	])("$label", ({ body, path, written }) => {
		const [ref] = refsOf(body)

		expect(ref.path).toBe(path)
		expect(body.slice(ref.start, ref.end)).toBe(written)
	})

	it("leaves a definition that only links use", () => {
		expect(refsOf("[The file][file]\n\n[file]: media/shot.png")).toEqual([])
	})

	it("reads a path with ./ as the same file as one without", () => {
		const refs = refsOf("![a](./media/a.png) ![a](media/a.png)")

		expect(localMediaPaths(refs)).toEqual(["media/a.png"])
		expect(refs).toHaveLength(2)
	})

	it("keeps a malformed percent escape as written", () => {
		expect(refsOf("![a](media/100%.png)")[0].path).toBe("media/100%.png")
	})

	it("splits a fragment and a query off the path", () => {
		const [withFragment] = refsOf("![a](media/demo.mp4#t=5)")
		const [withQuery] = refsOf("![a](media/a.png?v=2)")

		expect(withFragment).toMatchObject({
			path: "media/demo.mp4",
			suffix: "#t=5",
		})
		expect(withQuery).toMatchObject({ path: "media/a.png", suffix: "?v=2" })
	})

	it("locates the destination, not the same text in the alt", () => {
		const body = "![media/a.png](media/a.png)"
		const [ref] = refsOf(body)

		expect(ref.start).toBe(body.lastIndexOf("media/a.png"))
	})

	it("locates the destination when a title follows it", () => {
		const body = '![a](media/a.png "A title")'
		const [ref] = refsOf(body)

		expect(body.slice(ref.start, ref.end)).toBe("media/a.png")
	})

	it("refuses a path that climbs out of the post's folder", () => {
		const scan = scanLocalMedia("![a](../shared/a.png)")

		expect(scan).toEqual({
			ok: false,
			reason:
				'The media path "../shared/a.png" must stay inside the post\'s folder',
		})
	})

	it("refuses a path that climbs out midway", () => {
		expect(scanLocalMedia("![a](media/../../a.png)").ok).toBe(false)
	})

	it("refuses a path with nothing in it", () => {
		expect(scanLocalMedia("![a](./)").ok).toBe(false)
	})

	it("refuses a path written with a backslash escape, which it can't rewrite", () => {
		// The parser decodes `\(` to `(`, so the decoded path is not in the source.
		const scan = scanLocalMedia("![a](media/shot\\(1\\).png)")

		expect(scan.ok).toBe(false)
		expect(scan).toMatchObject({
			reason: expect.stringContaining("write it without escapes"),
		})
	})
})

// #endregion

// #region rewriteLocalMedia

describe("rewriteLocalMedia", () => {
	it("replaces a local path with its URL", () => {
		expect(rewrite("![Shot](media/shot.png)")).toBe(
			`![Shot](${STORE}/media/shot.png)`
		)
	})

	it("changes nothing but the destinations", () => {
		const body =
			"# Title\n\nIntro with `code` and a [link](other.md).\n\n![One](media/one.png)\n\n" +
			'```swift\nlet x = 1\n```\n\n![Two](media/two.mp4 "Title")\n\nOutro.  \n'

		expect(rewrite(body)).toBe(
			body
				.replace("media/one.png", `${STORE}/media/one.png`)
				.replace("media/two.mp4", `${STORE}/media/two.mp4`)
		)
	})

	it("returns a body with no local media unchanged", () => {
		const body = "![a](https://example.com/a.png) and ![b](/images/b.png)"

		expect(rewrite(body)).toBe(body)
	})

	it("rewrites every reference to the same file", () => {
		expect(rewrite("![a](media/a.png) and ![again](media/a.png)")).toBe(
			`![a](${STORE}/media/a.png) and ![again](${STORE}/media/a.png)`
		)
	})

	it("rewrites the destination and leaves the same text in the alt", () => {
		expect(rewrite("![media/a.png](media/a.png)")).toBe(
			`![media/a.png](${STORE}/media/a.png)`
		)
	})

	it("rewrites a reference definition and leaves the image that uses it", () => {
		expect(rewrite("![Shot][shot]\n\n[shot]: media/shot.png")).toBe(
			`![Shot][shot]\n\n[shot]: ${STORE}/media/shot.png`
		)
	})

	it("keeps the fragment and the query after the URL", () => {
		expect(rewrite("![a](media/demo.mp4#t=5)")).toBe(
			`![a](${STORE}/media/demo.mp4#t=5)`
		)
		expect(rewrite("![a](media/a.png?v=2)")).toBe(
			`![a](${STORE}/media/a.png?v=2)`
		)
	})

	it("keeps the angle brackets around a rewritten destination", () => {
		const refs = refsOf("![a](<media/my shot.png>)")
		const urlByPath = new Map([
			["media/my shot.png", `${STORE}/hash-my-shot.png`],
		])

		expect(
			rewriteLocalMedia("![a](<media/my shot.png>)", refs, urlByPath)
		).toBe(`![a](<${STORE}/hash-my-shot.png>)`)
	})

	it("leaves hosted and site-relative images between local ones untouched", () => {
		const body =
			"![a](media/a.png)\n\n![b](/images/b.png)\n\n![c](https://example.com/c.png)\n\n![d](media/d.png)"

		expect(rewrite(body)).toBe(
			`![a](${STORE}/media/a.png)\n\n![b](/images/b.png)\n\n![c](https://example.com/c.png)\n\n![d](${STORE}/media/d.png)`
		)
	})

	it("produces a body the renderer shows as an image and a video", async () => {
		const html = await markdownToHtml(
			rewrite("![Shot](media/shot.png)\n\n![Demo](media/demo.mp4)")
		)

		expect(html).toContain(`<img src="${STORE}/media/shot.png" alt="Shot">`)
		expect(html).toContain(`<video src="${STORE}/media/demo.mp4"`)
	})

	it("throws when a path was not resolved", () => {
		const refs = refsOf("![a](media/a.png)")

		expect(() =>
			rewriteLocalMedia("![a](media/a.png)", refs, new Map())
		).toThrow("No URL resolved for media path media/a.png")
	})
})

// #endregion

// #region localMediaSkipReason

describe("localMediaSkipReason", () => {
	it("is null for a body with no local media", () => {
		expect(localMediaSkipReason("Text and ![a](/images/a.png).")).toBeNull()
	})

	it("names the files and the script that uploads them", () => {
		const reason = localMediaSkipReason(
			"![a](media/a.png)\n\n![b](media/b.mp4)\n\n![a again](media/a.png)"
		)

		expect(reason).toBe(
			"References local media (media/a.png, media/b.mp4); " +
				"import it with `yarn db:import-posts`, which uploads the files"
		)
	})

	it("names three files at most and counts the rest", () => {
		const body = ["a", "b", "c", "d", "e"]
			.map((name) => `![${name}](media/${name}.png)`)
			.join("\n\n")

		expect(localMediaSkipReason(body)).toBe(
			"References local media (media/a.png, media/b.png, media/c.png, +2 more); " +
				"import it with `yarn db:import-posts`, which uploads the files"
		)
	})

	it("names exactly three files with no count", () => {
		const body = "![a](media/a.png) ![b](media/b.png) ![c](media/c.png)"

		expect(localMediaSkipReason(body)).toContain(
			"(media/a.png, media/b.png, media/c.png);"
		)
	})

	it("passes on the scan's own refusal", () => {
		expect(localMediaSkipReason("![a](../a.png)")).toContain(
			"must stay inside the post's folder"
		)
	})
})

// #endregion

// #region mediaFileProblem

describe("mediaFileProblem", () => {
	const SOME_BYTES = new Uint8Array([1, 2, 3])

	it.each(["a.png", "a.jpg", "a.jpeg", "a.gif", "a.webp", "a.avif"])(
		"accepts the image %s by its extension",
		(name) => {
			expect(mediaFileProblem(`media/${name}`, SOME_BYTES)).toBeNull()
		}
	)

	it("reads the extension whatever its case", () => {
		expect(mediaFileProblem("media/SHOT.PNG", SOME_BYTES)).toBeNull()
	})

	it("accepts an MP4 and a WebM whose bytes match", () => {
		expect(mediaFileProblem("media/a.mp4", ftypBox("isom", []))).toBeNull()
		expect(mediaFileProblem("media/a.webm", ebmlHeader("webm"))).toBeNull()
	})

	it.each(["a.mov", "a.svg", "a.heic", "a.mkv", "a.pdf", "a", "a.png.txt"])(
		"refuses the unsupported type %s",
		(name) => {
			expect(mediaFileProblem(`media/${name}`, SOME_BYTES)).toBe(
				`media/${name} is not a supported media type (use png, jpg, gif, webp, avif, jpeg, mp4, webm)`
			)
		}
	)

	it("reads the extension from the filename, not from a dotted folder", () => {
		expect(mediaFileProblem("media.v2/clip", SOME_BYTES)).toContain(
			"not a supported media type"
		)
	})

	it("refuses an empty file", () => {
		expect(mediaFileProblem("media/a.png", new Uint8Array(0))).toBe(
			"media/a.png is empty"
		)
	})

	it("refuses a QuickTime movie renamed to .mp4", () => {
		expect(mediaFileProblem("media/a.mp4", ftypBox("qt  ", []))).toBe(
			"media/a.mp4 is not an MP4 or WebM video (convert a .mov to MP4 first)"
		)
	})

	it("refuses a video whose bytes are the other video type", () => {
		expect(mediaFileProblem("media/a.mp4", ebmlHeader("webm"))).toBe(
			"media/a.mp4 holds video/webm data; rename it to .webm"
		)
	})

	it("refuses a video over the cap and accepts one at exactly the cap", () => {
		const header = ftypBox("isom", [])
		const atCap = new Uint8Array(MAX_VIDEO_UPLOAD_BYTES)
		const overCap = new Uint8Array(MAX_VIDEO_UPLOAD_BYTES + 1)
		atCap.set(header)
		overCap.set(header)

		expect(mediaFileProblem("media/a.mp4", atCap)).toBeNull()
		expect(mediaFileProblem("media/a.mp4", overCap)).toBe(
			"media/a.mp4 is 20.0 MiB; a video can be 20 MiB at most"
		)
	})

	it("puts no size cap on an image", () => {
		expect(
			mediaFileProblem(
				"media/a.png",
				new Uint8Array(MAX_VIDEO_UPLOAD_BYTES + 1)
			)
		).toBeNull()
	})
})

// #endregion

// #region Blob keys

describe("post media keys", () => {
	const HASH = "0123456789abcdef"

	it("prefixes a post's media with its section and slug", () => {
		expect(postMediaPrefixFor("tech", "my-post")).toBe("posts/tech/my-post/")
	})

	it("keeps the two sections apart for the same slug", () => {
		expect(postMediaPrefixFor("tech", "hello")).not.toBe(
			postMediaPrefixFor("life", "hello")
		)
	})

	it("puts every post of a section under the section prefix", () => {
		expect(
			postMediaPrefixFor("tech", "my-post").startsWith(
				postMediaSectionPrefix("tech")
			)
		).toBe(true)
	})

	it("builds a content-addressed key that keeps the folders and the filename", () => {
		expect(
			postMediaKeyFor("tech", "my-post", "media/my-post/demo.mp4", HASH)
		).toBe(`posts/tech/my-post/media/my-post/${HASH}-demo.mp4`)
	})

	it("changes the key when the bytes change, and only then", () => {
		const key = postMediaKeyFor("tech", "p", "a.png", "aaaa")

		expect(postMediaKeyFor("tech", "p", "a.png", "aaaa")).toBe(key)
		expect(postMediaKeyFor("tech", "p", "a.png", "bbbb")).not.toBe(key)
	})

	it("sanitises a filename with spaces", () => {
		expect(postMediaKeyFor("tech", "p", "media/my shot.png", HASH)).toBe(
			`posts/tech/p/media/${HASH}-my-shot.png`
		)
	})

	it("keeps a video's extension, so the renderer still reads it as a video", () => {
		const key = postMediaKeyFor("tech", "p", "media/Demo.mp4", HASH)

		expect(isVideoUrl(`${STORE}/${key}`)).toBe(true)
	})

	it("stays under the post's prefix for every path", () => {
		const key = postMediaKeyFor("tech", "p", "a/b/c.png", HASH)

		expect(key.startsWith(postMediaPrefixFor("tech", "p"))).toBe(true)
	})
})

// #endregion

// #region orphanedPostMedia

describe("orphanedPostMedia", () => {
	const PREFIX = "posts/tech/my-post/"
	const kept = blob(`${PREFIX}aaaa-shot.png`)
	const dropped = blob(`${PREFIX}bbbb-old.png`)

	it("returns the blobs under the prefix the body no longer names", () => {
		const body = `![Shot](${kept.url})`

		expect(orphanedPostMedia([kept, dropped], PREFIX, body)).toEqual([dropped])
	})

	it("keeps a blob named with a fragment or a query after it", () => {
		const body = `![Demo](${kept.url}#t=5)`

		expect(orphanedPostMedia([kept], PREFIX, body)).toEqual([])
	})

	it("never returns a blob of another post", () => {
		const other = blob("posts/tech/other-post/cccc-shot.png")

		expect(orphanedPostMedia([other], PREFIX, "No media.")).toEqual([])
	})

	it("never returns a blob of a post whose slug only starts the same", () => {
		const longer = blob("posts/tech/my-post-two/dddd-shot.png")

		expect(orphanedPostMedia([longer], PREFIX, "No media.")).toEqual([])
	})

	it("returns every blob of a post whose body dropped all media", () => {
		expect(orphanedPostMedia([kept, dropped], PREFIX, "Text only.")).toEqual([
			kept,
			dropped,
		])
	})

	it("returns nothing for an empty listing", () => {
		expect(orphanedPostMedia([], PREFIX, "Text only.")).toEqual([])
	})
})

// #endregion
