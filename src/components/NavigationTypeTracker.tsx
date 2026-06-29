"use client"

import { useEffect } from "react"
import { installNavigationTypeTracking } from "@/lib/client/navigationType"

/**
 * Installs back/forward navigation tracking once on mount so entrance
 * animations (`fadeUp`) can stay still when the user returns to a page via the
 * browser's back/forward buttons. Renders nothing.
 */
export default function NavigationTypeTracker() {
	useEffect(() => {
		installNavigationTypeTracking()
	}, [])

	return null
}
