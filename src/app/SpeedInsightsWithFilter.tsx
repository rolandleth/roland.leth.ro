"use client"

import { SpeedInsights } from "@vercel/speed-insights/next"

export default function SpeedInsightsWithFilter() {
	return (
		<SpeedInsights
			beforeSend={(event) => (event.url.includes("/admin") ? null : event)}
		/>
	)
}
