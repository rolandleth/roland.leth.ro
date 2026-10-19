import type { Element, Root } from "hast"

/** The attributes that point at another resource, by the tag that has them. */
const URL_ATTRIBUTES: Record<string, string> = {
	a: "href",
	img: "src",
	video: "src",
}

interface Options {
	/** The site's origin, with no trailing slash: `https://roland.leth.ro`. */
	baseUrl: string
}

/**
 * Rehype plugin: makes root-relative URLs absolute on `baseUrl`, so
 * `/videos/demo.mp4` becomes `https://roland.leth.ro/videos/demo.mp4`.
 *
 * For the Atom feed, which a reader shows away from the site: a root-relative
 * `src` or `href` there resolves against the feed reader's own origin, or not
 * at all, so a `public/` image or video and an in-site link break. The page
 * processor doesn't use it, since on the page those URLs already resolve.
 *
 * Only root-relative URLs change. An absolute or protocol-relative one is
 * already complete; a path relative to the post (`images/a.png`) or a bare
 * fragment (`#notes`) would need the post's own URL, which the body doesn't
 * know, and is left as written.
 */
export function rehypeAbsoluteUrls({ baseUrl }: Options) {
	return (tree: Root): void => {
		absolutize(tree, baseUrl)
	}
}

function absolutize(parent: Root | Element, baseUrl: string): void {
	for (const child of parent.children) {
		if (child.type !== "element") {
			continue
		}

		const attribute = URL_ATTRIBUTES[child.tagName]
		const value = attribute == null ? null : child.properties[attribute]

		if (
			attribute != null &&
			typeof value === "string" &&
			isRootRelative(value)
		) {
			child.properties[attribute] = `${baseUrl}${value}`
		}

		absolutize(child, baseUrl)
	}
}

/** `/path`, but not `//host/path`, which is protocol-relative. */
function isRootRelative(url: string): boolean {
	return url.startsWith("/") && !url.startsWith("//")
}
