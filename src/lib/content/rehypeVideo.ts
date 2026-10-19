import { isVideoUrl } from "@/lib/utils/video"
import type { Element, ElementContent, Root } from "hast"

/** Link text of the fallback when the image syntax carried no alt text. */
const FALLBACK_LINK_TEXT = "Video"

/**
 * Rehype plugin: turns an image whose URL names a video file into a `<video>`.
 * `![A demo](/clip.mp4)` is how a markdown body embeds one.
 *
 * Image syntax rather than a raw `<video>` tag because the pipelines drop raw
 * HTML on purpose (see the "drops raw HTML" test), and this keeps that contract:
 * the only markup that can reach the page is what this plugin builds.
 *
 * Runs on the hast tree, so reference-style images (`![A demo][clip]`) are
 * covered too, and the page and feed processors share one implementation.
 *
 * A video inside a link (`[![A demo](/clip.mp4)](https://…)`) comes out of
 * it: a `<video>` inside an `<a>` is invalid, its fallback link would nest one
 * `<a>` in another, and a click on the controls could follow the outer link.
 * See `liftVideosOutOf`.
 */
export function rehypeVideo(options: RehypeVideoOptions = {}) {
	const preload = options.preload ?? "metadata"

	return (tree: Root): void => {
		replaceVideoImages(tree, preload)
	}
}

export interface RehypeVideoOptions {
	/**
	 * `metadata` (the default) fetches enough for the first frame and the
	 * duration, without the whole clip. `none` fetches nothing until the reader
	 * presses play: for the blog list's cards, where every video near the top
	 * of a post would otherwise fetch its metadata on each list view. An MP4
	 * whose index sits at its end (not "faststart") can fetch a large part of the
	 * file for that, against the Blob transfer allowance.
	 */
	preload?: "metadata" | "none"
}

function replaceVideoImages(
	parent: Root | Element,
	preload: "metadata" | "none"
): void {
	for (const child of parent.children) {
		if (child.type !== "element") {
			continue
		}

		if (child.tagName === "img") {
			convertToVideo(child, preload)
			continue
		}

		replaceVideoImages(child, preload)

		if (child.tagName === "a") {
			liftVideosOutOf(child)
		}
	}
}

/**
 * Moves the videos out of a link, in place: the `<a>` becomes a `<span>`
 * holding the videos, then the link with whatever else it held. A link left
 * with nothing to read gets its own URL as its text, which says where it goes;
 * the video's alt describes the video, not the destination. A link with no
 * video is left as it is.
 */
function liftVideosOutOf(link: Element): void {
	const videos = takeVideos(link)

	if (videos.length === 0) {
		return
	}

	const href = link.properties.href
	const children: ElementContent[] = hasContent(link)
		? link.children
		: [{ type: "text", value: typeof href === "string" ? href : "Link" }]
	const lifted: Element = { ...link, children }

	link.tagName = "span"
	link.properties = {}
	link.children = [...videos, lifted]
}

/** Removes and returns every `<video>` under `parent`, in document order. */
function takeVideos(parent: Element): Element[] {
	const videos: Element[] = []

	parent.children = parent.children.filter((child) => {
		if (child.type !== "element") {
			return true
		}

		if (child.tagName === "video") {
			videos.push(child)

			return false
		}

		videos.push(...takeVideos(child))

		return true
	})

	return videos
}

/** Whether a node still holds something to read or see: text, or an image. */
function hasContent(node: Element): boolean {
	return node.children.some(
		(child) =>
			(child.type === "text" && child.value.trim() !== "") ||
			(child.type === "element" &&
				(child.tagName === "img" || hasContent(child)))
	)
}

/**
 * A URL a `<video>` and its fallback link may carry: http(s), or one with no
 * scheme (`/videos/a.mp4`, `media/a.mp4`). Anything else (`javascript:`,
 * `data:`) stays the `<img>` markdown made of it, so the fallback link can't
 * carry a scheme a link shouldn't have.
 */
const VIDEO_SCHEME = /^(?:https?:|[^:/?#]*(?:[/?#]|$))/i

/** Rewrites `image` in place when its `src` is a video; leaves it alone otherwise. */
function convertToVideo(image: Element, preload: "metadata" | "none"): void {
	const { src, alt, title } = image.properties

	if (typeof src !== "string" || !VIDEO_SCHEME.test(src) || !isVideoUrl(src)) {
		return
	}

	const label = typeof alt === "string" && alt.trim() !== "" ? alt : null

	image.tagName = "video"
	image.properties = {
		src,
		controls: true,
		// Never the whole clip up front: the reader may never play it. See
		// `RehypeVideoOptions.preload`.
		preload,
		// Without it, iPhone Safari opens the video full screen on play.
		playsInline: true,
		...(label == null ? {} : { ariaLabel: label }),
		...(typeof title === "string" ? { title } : {}),
	}
	// Shown where `<video>` is unsupported, and what remains in a feed reader
	// that strips the element but keeps its content.
	image.children = [
		{
			type: "element",
			tagName: "a",
			properties: { href: src },
			children: [{ type: "text", value: label ?? FALLBACK_LINK_TEXT }],
		},
	]
}
