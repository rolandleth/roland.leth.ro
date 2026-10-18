import Image from "next/image"
import type { Storefront } from "@/lib/utils/platforms"

interface Props {
	storefront: Storefront
	/** The listing URL; the badge is only ever a link to the store, per Apple's guidelines. */
	href: string
	/**
	 * Draws the badge 56px tall instead of 40px: the product page's store
	 * buttons, where the badge is the page's main call to action. The gallery
	 * tiles and the tabbed layout keep the 40px one.
	 */
	isLarge?: boolean
	className?: string
}

/** Apple authors the artwork at 40pt, the smallest height its guidelines allow on screen. */
const BADGE_HEIGHT = 40

// The two drawn heights. `.product-status-cta` and `.product-status-cta-large`
// in `globals.css` match them, so a status in the badge's place keeps the row's
// shape.
const BADGE_HEIGHT_CLASS = "h-10"
const LARGE_BADGE_HEIGHT_CLASS = "h-14"

/**
 * Per-storefront artwork, straight from Apple's marketing kit and unmodified,
 * as its guidelines require. `light` is the black badge, for light
 * backgrounds; `dark` the white one, for dark backgrounds. Widths are the
 * SVGs' intrinsic widths at 40pt, rounded, so `next/image` reserves the right
 * box before the file arrives.
 */
const BADGES: Record<
	Storefront,
	{ alt: string; width: number; light: string; dark: string }
> = {
	AppStore: {
		alt: "Download on the App Store",
		width: 120,
		light: "/images/app-store/as-black.svg",
		dark: "/images/app-store/as-white.svg",
	},
	MacAppStore: {
		alt: "Download on the Mac App Store",
		width: 156,
		light: "/images/app-store/mas-black.svg",
		dark: "/images/app-store/mas-white.svg",
	},
}

/**
 * Apple's "Download on the App Store" / "Download on the Mac App Store" badge,
 * linking to the listing.
 *
 * Both theme variants are in the DOM and the `dark` class on `<html>` picks
 * one. The theme is a class set before first paint (see `ThemeScript`), so a
 * `<picture>` media query wouldn't follow the manual toggle, and swapping
 * `src` from React state would flash the wrong badge at dark-mode visitors
 * until hydration. The link carries the accessible name; the images are
 * marked decorative so the hidden variant can't double it.
 *
 * Both images load eagerly. The hero badge is above the fold, and a lazy image
 * hidden with `display: none` isn't fetched until the theme toggle shows it,
 * which leaves the badge blank for a moment. The cost is the other variant's
 * SVG (~10 KB) on every first visit; the repeated CTA reuses the same URLs, so
 * each file downloads once per page.
 */
export default function AppStoreBadge({
	storefront,
	href,
	isLarge = false,
	className,
}: Props) {
	const badge = BADGES[storefront]
	const heightClass = isLarge ? LARGE_BADGE_HEIGHT_CLASS : BADGE_HEIGHT_CLASS

	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={badge.alt}
			className={[
				"block transition-opacity duration-300 hover:opacity-80",
				className,
			]
				.filter(Boolean)
				.join(" ")}
		>
			<Image
				src={badge.light}
				alt=""
				width={badge.width}
				height={BADGE_HEIGHT}
				loading="eager"
				className={`${heightClass} w-auto dark:hidden`}
			/>
			<Image
				src={badge.dark}
				alt=""
				width={badge.width}
				height={BADGE_HEIGHT}
				loading="eager"
				className={`hidden ${heightClass} w-auto dark:block`}
			/>
		</a>
	)
}
