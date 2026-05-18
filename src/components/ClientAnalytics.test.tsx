import { describe, expect, it } from "vitest"
import { filterAdminEvents } from "@/lib/client/analytics"
import ClientAnalytics from "./ClientAnalytics"

describe("ClientAnalytics", () => {
	it("wires filterAdminEvents as beforeSend on both telemetry components", () => {
		// Call the component as a function to inspect the returned JSX — same
		// approach as the edit-page tests. Avoids rendering Vercel telemetry
		// in a test environment while still asserting the wiring is correct.
		const element = ClientAnalytics()
		const [speedInsightsEl, analyticsEl] = element.props.children
		expect(speedInsightsEl.props.beforeSend).toBe(filterAdminEvents)
		expect(analyticsEl.props.beforeSend).toBe(filterAdminEvents)
	})
})
