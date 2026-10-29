import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import ICloudDeletionSteps from "./ICloudDeletionSteps"

/** The rendered text with line wrapping collapsed, so phrases match across JSX line breaks. */
function renderedText(element: React.ReactElement): string {
	const { container } = render(element)

	return (container.textContent ?? "").replace(/\s+/g, " ")
}

describe("ICloudDeletionSteps", () => {
	it("names the app at every step, and the Settings path to its iCloud data", () => {
		const text = renderedText(<ICloudDeletionSteps appName="Weekly Gym" />)

		expect(text).toContain("Weekly Gym has no button that deletes everything.")
		expect(text).toContain("delete Weekly Gym from every device that has it")
		// Apple's own two names for the screen, as its article has them.
		expect(text).toContain(
			"in Settings, tap your name, then iCloud, then Storage or Manage Account Storage, choose Weekly Gym and tap Delete Data from iCloud."
		)
		expect(text).toContain("If Weekly Gym has never synced")
		expect(text).toContain("iCloud has always been off for Weekly Gym")
		expect(text).toContain("turning iCloud off for Weekly Gym, leaves")
	})

	// The app goes first: deleting the iCloud data while a device still has the
	// app lets that device sync its copy back.
	it("deletes the app before its iCloud data, and says why", () => {
		const text = renderedText(<ICloudDeletionSteps appName="Reckon" />)

		expect(text.indexOf("delete Reckon from every device")).toBeLessThan(
			text.indexOf("tap Delete Data from iCloud")
		)
		expect(text).toContain("so no device is left that could sync its copy back")
	})

	// The path is Apple's, so the page links Apple's article for it, the way the
	// other outbound legal links open.
	it("links Apple's article for the Settings path, in a new tab", () => {
		render(<ICloudDeletionSteps appName="Reckon" />)

		const link = screen.getByRole("link", { name: "Apple describes it" })

		expect(link).toHaveAttribute(
			"href",
			"https://support.apple.com/en-us/108922"
		)
		expect(link).toHaveAttribute("target", "_blank")
		expect(link).toHaveAttribute("rel", "noopener noreferrer")
	})

	it("calls the data 'your data' by default", () => {
		const text = renderedText(<ICloudDeletionSteps appName="Reckon" />)

		expect(text).toContain("To delete your data, delete Reckon")
	})

	it("uses the page's own name for the data when given one", () => {
		const text = renderedText(
			<ICloudDeletionSteps appName="Digest" dataName="your journal" />
		)

		expect(text).toContain("To delete your journal, delete Digest")
		expect(text).not.toContain("your data")
	})

	// Signing out stops sync but doesn't delete what synced; the page must not
	// suggest that deleting the app is enough once anything has synced.
	it("says what already synced stays in iCloud after signing out", () => {
		const text = renderedText(<ICloudDeletionSteps appName="Digest" />)

		expect(text).toContain(
			"Signing out of iCloud, or turning iCloud off for Digest, leaves what already synced in your iCloud account until you delete it there"
		)
	})
})
