"use client"

import { Analytics } from "@vercel/analytics/next"
import { filterAdminEvents } from "@/lib/analytics"

export default function AnalyticsWithFilter() {
	return <Analytics beforeSend={filterAdminEvents} />
}
