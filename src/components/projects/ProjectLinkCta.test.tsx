import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ProjectLinkCta from "./ProjectLinkCta"
import type { LinkCta } from "@/lib/utils/platforms"

const url = "https://apps.apple.com/app/id123"
const accent = "#b5673f"

function renderCta(
	cta: LinkCta,
	{ isBadgeLarge }: { isBadgeLarge?: boolean } = {}
) {
	return render(
		<ProjectLinkCta
			url={url}
			cta={cta}
			accent={accent}
			isBadgeLarge={isBadgeLarge}
		/>
	)
}

// #region Badge

describe("ProjectLinkCta — badge", () => {
	it.each([
		["AppStore", "Download on the App Store"],
		["MacAppStore", "Download on the Mac App Store"],
	] as const)(
		"draws the %s badge, linking to the listing",
		(storefront, name) => {
			renderCta({ kind: "badge", storefront })

			const link = screen.getByRole("link", { name })

			expect(link).toHaveAttribute("href", url)
			// The hero grid would otherwise stretch the anchor to its column.
			expect(link).toHaveClass("justify-self-center")
		}
	)

	it("keeps Apple's artwork: the accent never colours the badge", () => {
		renderCta({ kind: "badge", storefront: "AppStore" })

		expect(
			screen.getByRole("link", { name: "Download on the App Store" })
		).not.toHaveAttribute("style")
	})

	it.each([
		["40px by default", undefined, "h-10"],
		["56px when large", true, "h-14"],
	] as const)("draws the badge %s", (_label, isBadgeLarge, heightClass) => {
		renderCta({ kind: "badge", storefront: "AppStore" }, { isBadgeLarge })

		const images = screen
			.getByRole("link", { name: "Download on the App Store" })
			.querySelectorAll("img")

		// The light and the dark artwork.
		expect(images).toHaveLength(2)
		for (const image of images) {
			expect(image).toHaveClass(heightClass)
		}
	})
})

// #endregion

// #region Pills

describe("ProjectLinkCta — pills", () => {
	it.each([
		["a store pill", { kind: "storePill", label: "Get on App Store" }],
		["a plain pill", { kind: "plainPill", label: "Privacy" }],
	] as const)(
		"draws %s with its label, in the accent, opening in a new tab",
		(_label, cta) => {
			renderCta(cta)

			const link = screen.getByRole("link", { name: cta.label })

			expect(link).toHaveAttribute("href", url)
			expect(link).toHaveAttribute("target", "_blank")
			expect(link).toHaveAttribute("rel", "noopener noreferrer")
			expect(link).toHaveStyle({ color: accent })
			expect(link.querySelector("img")).toBeNull()
		}
	)

	it("keeps a pill's size when the badge is large", () => {
		const cta: LinkCta = { kind: "storePill", label: "Get on App Store" }
		const { unmount } = renderCta(cta)
		const smallClass = screen.getByRole("link").className

		unmount()
		renderCta(cta, { isBadgeLarge: true })

		expect(screen.getByRole("link").className).toBe(smallClass)
	})
})

// #endregion
