import { isVideoUrl } from "@/lib/utils/video"
import type { Element, Root } from "hast"

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
 */
export function rehypeVideo() {
	return (tree: Root): void => {
		replaceVideoImages(tree)
	}
}

function replaceVideoImages(parent: Root | Element): void {
	for (const child of parent.children) {
		if (child.type !== "element") {
			continue
		}

		if (child.tagName === "img") {
			convertToVideo(child)
		} else {
			replaceVideoImages(child)
		}
	}
}

/** Rewrites `image` in place when its `src` is a video; leaves it alone otherwise. */
function convertToVideo(image: Element): void {
	const { src, alt, title } = image.properties

	if (typeof src !== "string" || !isVideoUrl(src)) {
		return
	}

	const label = typeof alt === "string" && alt.trim() !== "" ? alt : null

	image.tagName = "video"
	image.properties = {
		src,
		controls: true,
		// Metadata only: enough for the first frame and the duration, without
		// downloading a whole clip the reader may never play.
		preload: "metadata",
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
