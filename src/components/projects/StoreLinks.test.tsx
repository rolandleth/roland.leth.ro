import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import StoreLinks from "./StoreLinks"
import type { StoreLink } from "./StoreLinks"
import type { ComponentProps } from "react"

const iPhoneLink: StoreLink = {
	link: { id: 1, url: "https://apps.apple.com/app/id1" },
	cta: { kind: "badge", storefront: "AppStore" },
}
// A second listing, as an app on the iPhone and the Mac has. With two store
// links, `linkCtasFor` gives both the generic App Store badge.
const secondListing: StoreLink = {
	link: { id: 2, url: "https://apps.apple.com/app/id2" },
	cta: { kind: "badge", storefront: "AppStore" },
}

const ROW_CLASS = "store-row"

function renderLinks(overrides: Partial<ComponentProps<typeof StoreLinks>>) {
	return render(
		<StoreLinks
			storeLinks={[]}
			statusLabel={null}
			accent="#b5673f"
			isLarge
			className={ROW_CLASS}
			{...overrides}
		/>
	)
}

function badges(): HTMLElement[] {
	return screen.queryAllByRole("link", { name: "Download on the App Store" })
}

function isBefore(first: Element, second: Element): boolean {
	return (
		(first.compareDocumentPosition(second) &
			Node.DOCUMENT_POSITION_FOLLOWING) !==
		0
	)
}

// #region Buttons and status

describe("StoreLinks — buttons and status", () => {
	it("shows every store button, in link order, in one row", () => {
		const { container } = renderLinks({
			storeLinks: [iPhoneLink, secondListing],
		})

		const row = container.querySelector(`.${ROW_CLASS}`)

		expect(badges().map((badge) => badge.getAttribute("href"))).toEqual([
			iPhoneLink.link.url,
			secondListing.link.url,
		])
		for (const badge of badges()) {
			expect(row).toContainElement(badge)
		}
	})

	it.each([
		["large", true, "h-14"],
		["small", false, "h-10"],
	] as const)("draws the %s badge", (_label, isLarge, heightClass) => {
		renderLinks({ storeLinks: [iPhoneLink], isLarge })

		for (const image of badges()[0].querySelectorAll("img")) {
			expect(image).toHaveClass(heightClass)
		}
	})

	// A Mac app's only listing names its store.
	it("draws the Mac App Store badge for a Mac App Store link", () => {
		const macOnlyLink: StoreLink = {
			link: { id: 3, url: "https://apps.apple.com/app/id3" },
			cta: { kind: "badge", storefront: "MacAppStore" },
		}

		renderLinks({ storeLinks: [macOnlyLink] })

		expect(
			screen.getByRole("link", { name: "Download on the Mac App Store" })
		).toHaveAttribute("href", macOnlyLink.link.url)
		expect(badges()).toHaveLength(0)
	})

	it.each([
		["large", true, "product-status-cta-large"],
		["small", false, "product-status-cta"],
	] as const)(
		"puts the %s status in the buttons' place when there are none",
		(_label, isLarge, statusClass) => {
			const { container } = renderLinks({
				statusLabel: "Coming soon",
				isLarge,
			})

			const status = screen.getByText("Coming soon")

			expect(status.tagName).toBe("P")
			expect(status).toHaveClass(statusClass)
			expect(status.parentElement).toBe(
				container.querySelector(`.${ROW_CLASS}`)
			)
			expect(screen.queryByRole("link")).not.toBeInTheDocument()
		}
	)

	it("shows the store buttons rather than the status when it has both", () => {
		renderLinks({ storeLinks: [iPhoneLink], statusLabel: "Coming soon" })

		expect(badges()).toHaveLength(1)
		expect(screen.queryByText("Coming soon")).not.toBeInTheDocument()
	})

	it("renders nothing with no buttons, no status and no trailing link", () => {
		const { container } = renderLinks({})

		expect(container).toBeEmptyDOMElement()
	})
})

// #endregion

// #region Trailing link and store note

describe("StoreLinks — trailing link and store note", () => {
	const trailingLink = <a href="#how-it-works">See how it works</a>

	it.each([
		["the buttons", { storeLinks: [iPhoneLink] }],
		["the status", { statusLabel: "Coming soon" }],
	])("ends the row with the trailing link, after %s", (_label, overrides) => {
		const { container } = renderLinks({ ...overrides, trailingLink })

		const row = container.querySelector(`.${ROW_CLASS}`) as HTMLElement
		const link = screen.getByRole("link", { name: "See how it works" })

		expect(row.lastElementChild).toBe(link)
		expect(isBefore(row.firstElementChild as Element, link)).toBe(true)
	})

	it("keeps the row for a trailing link alone", () => {
		const { container } = renderLinks({ trailingLink })

		const row = container.querySelector(`.${ROW_CLASS}`)

		expect(row).toContainElement(
			screen.getByRole("link", { name: "See how it works" })
		)
	})

	it("puts the store note under the row, beside the buttons", () => {
		const { container } = renderLinks({
			storeLinks: [iPhoneLink],
			storeNote: "Logging is free, forever.",
		})

		const row = container.querySelector(`.${ROW_CLASS}`) as HTMLElement
		const note = screen.getByText("Logging is free, forever.")

		expect(row).not.toContainElement(note)
		expect(isBefore(row, note)).toBe(true)
	})

	// The note speaks for the listing, which isn't there yet.
	it("leaves the store note out when the status stands in for the buttons", () => {
		renderLinks({
			statusLabel: "Coming soon",
			storeNote: "Logging is free, forever.",
		})

		expect(screen.getByText("Coming soon")).toBeInTheDocument()
		expect(
			screen.queryByText("Logging is free, forever.")
		).not.toBeInTheDocument()
	})
})

// #endregion
