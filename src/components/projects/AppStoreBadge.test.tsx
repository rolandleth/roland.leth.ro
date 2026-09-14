import { existsSync } from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import AppStoreBadge from "./AppStoreBadge"
import type { Storefront } from "@/lib/utils/platforms"

const href = "https://apps.apple.com/app/id123"

// A `Record` so a new `Storefront` member fails to compile until it has a row.
const expectedBadges: Record<
	Storefront,
	{ name: string; light: string; dark: string }
> = {
	AppStore: {
		name: "Download on the App Store",
		light: "/images/app-store/as-black.svg",
		dark: "/images/app-store/as-white.svg",
	},
	MacAppStore: {
		name: "Download on the Mac App Store",
		light: "/images/app-store/mas-black.svg",
		dark: "/images/app-store/mas-white.svg",
	},
}

const storefrontCases = Object.entries(expectedBadges) as [
	Storefront,
	(typeof expectedBadges)[Storefront],
][]

function renderBadge(storefront: Storefront, className?: string) {
	render(
		<AppStoreBadge storefront={storefront} href={href} className={className} />
	)

	const link = screen.getByRole("link", {
		name: expectedBadges[storefront].name,
	})
	const [light, dark] = Array.from(link.querySelectorAll("img"))

	return { link, light, dark }
}

describe("AppStoreBadge", () => {
	it.each(storefrontCases)(
		"links the %s badge to the listing in a new tab",
		(storefront) => {
			const { link } = renderBadge(storefront)

			expect(link).toHaveAttribute("href", href)
			expect(link).toHaveAttribute("target", "_blank")
			expect(link).toHaveAttribute("rel", "noopener noreferrer")
		}
	)

	it.each(storefrontCases)(
		"ships the black %s artwork for light mode and the white one for dark mode",
		(storefront, expected) => {
			const { light, dark } = renderBadge(storefront)

			expect(light).toHaveAttribute("src", expected.light)
			expect(light.className.split(" ")).toContain("dark:hidden")
			expect(light.className.split(" ")).not.toContain("hidden")

			expect(dark).toHaveAttribute("src", expected.dark)
			expect(dark.className.split(" ")).toEqual(
				expect.arrayContaining(["hidden", "dark:block"])
			)
		}
	)

	// A renamed or mistyped artwork path would otherwise ship a broken badge.
	it.each(storefrontCases)(
		"points the %s badge at artwork that exists under public/",
		(_storefront, expected) => {
			for (const imagePath of [expected.light, expected.dark]) {
				expect(existsSync(path.join(process.cwd(), "public", imagePath))).toBe(
					true
				)
			}
		}
	)

	// The link carries the accessible name; a named image would double it.
	it.each(storefrontCases)(
		"marks both %s images as decorative",
		(storefront) => {
			const { light, dark } = renderBadge(storefront)

			expect(light).toHaveAttribute("alt", "")
			expect(dark).toHaveAttribute("alt", "")
		}
	)

	// The hero badge is above the fold, and a lazy image hidden with
	// `display: none` isn't fetched until the theme toggle shows it.
	it.each(storefrontCases)("loads both %s images eagerly", (storefront) => {
		const { light, dark } = renderBadge(storefront)

		expect(light).toHaveAttribute("loading", "eager")
		expect(dark).toHaveAttribute("loading", "eager")
	})

	it("appends the caller's className to the link", () => {
		const { link } = renderBadge("AppStore", "justify-self-center")

		expect(link.className.split(" ")).toEqual(
			expect.arrayContaining(["block", "justify-self-center"])
		)
	})
})
