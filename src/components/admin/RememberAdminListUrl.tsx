"use client"

import { useEffect } from "react"
import { rememberAdminListUrl } from "@/lib/client/adminListReturn"

/**
 * Records the dashboard list being shown, for `useAdminResource` to return to
 * after a save or delete. Renders nothing.
 */
export default function RememberAdminListUrl({ href }: { href: string }) {
	useEffect(() => {
		rememberAdminListUrl(href)
	}, [href])

	return null
}
