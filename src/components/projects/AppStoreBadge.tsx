import Image from "next/image"
import type { Storefront } from "@/lib/utils/platforms"

interface Props {
	storefront: Storefront
	/** The listing URL; the badge is only ever a link to the store, per Apple's guidelines. */
	href: string
	className?: string
}

/** Apple authors the artwork at 40pt, the smallest height its guidelines allow on screen. */
const BADGE_HEIGHT = 40

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
 */
export default function AppStoreBadge({ storefront, href, className }: Props) {
	const badge = BADGES[storefront]

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
				className="h-10 w-auto dark:hidden"
			/>
			<Image
				src={badge.dark}
				alt=""
				width={badge.width}
				height={BADGE_HEIGHT}
				className="hidden h-10 w-auto dark:block"
			/>
		</a>
	)
}
