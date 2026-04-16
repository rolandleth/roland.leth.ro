"use client"

import { SpeedInsights } from "@vercel/speed-insights/next"
import { filterAdminEvents } from "@/lib/analytics"

export default function SpeedInsightsWithFilter() {
	return <SpeedInsights beforeSend={filterAdminEvents} />
}
