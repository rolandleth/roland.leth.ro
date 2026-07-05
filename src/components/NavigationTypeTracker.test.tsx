import { render } from "@testing-library/react"
import { StrictMode } from "react"
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

	it("re-installs on re-mount — idempotency is the module's job, not the component's", () => {
		installSpy.mockClear()
		const { unmount } = render(<NavigationTypeTracker />)
		unmount()
		render(<NavigationTypeTracker />)

		// The component re-runs its mount effect each time; it's the module guard
		// (see navigationType.test.ts) that keeps a re-mount from stacking listeners.
		expect(installSpy).toHaveBeenCalledTimes(2)
	})

	it("survives StrictMode's double-invoked mount, deferring idempotency to the module", () => {
		installSpy.mockClear()
		render(
			<StrictMode>
				<NavigationTypeTracker />
			</StrictMode>
		)

		// React's dev StrictMode double-invokes the mount effect (mount → cleanup →
		// mount). The component has no cleanup and stays a no-op body, so it just
		// calls install again; the module's guard absorbs the repeat.
		expect(installSpy).toHaveBeenCalledTimes(2)
	})
})
