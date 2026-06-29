import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import NavigationTypeTracker from "./NavigationTypeTracker"

const installSpy = vi.fn()

vi.mock("@/lib/client/navigationType", () => ({
	installNavigationTypeTracking: () => installSpy(),
}))

describe("NavigationTypeTracker", () => {
	it("installs the tracker once on mount and renders nothing", () => {
		installSpy.mockClear()
		const { container } = render(<NavigationTypeTracker />)

		expect(installSpy).toHaveBeenCalledTimes(1)
		expect(container.firstChild).toBeNull()
	})
})
