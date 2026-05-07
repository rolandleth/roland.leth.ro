"use client"

import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from "@vercel/speed-insights/next"
import { filterAdminEvents } from "@/lib/analytics"

/**
 * Wraps both Vercel telemetry components in one client island so the root
 * layout doesn't import two near-identical files. `filterAdminEvents` drops
 * events under `/admin` so admin navigation doesn't distort public metrics.
 */
export default function ClientAnalytics() {
	return (
		<>
			<SpeedInsights beforeSend={filterAdminEvents} />
			<Analytics beforeSend={filterAdminEvents} />
		</>
	)
}
