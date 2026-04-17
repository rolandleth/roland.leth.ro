"use client"

import { useEffect, useState } from "react"

interface Props {
	/**
	 * The year computed at render time on the server. Used as the SSR/initial
	 * value so there's no flash of empty content; the client effect below
	 * corrects it after hydration if a stale cache served an older year.
	 */
	initialYear: number
}

/**
 * Tiny client island that owns just the copyright year. Lets `Footer` stay a
 * server component while still self-correcting on year boundaries — if a page
 * was statically rendered in 2026 and visited in 2027, the client effect
 * updates the displayed year on hydration.
 */
export default function FooterYear({ initialYear }: Props) {
	const [year, setYear] = useState(initialYear)

	useEffect(() => {
		const clientYear = new Date().getFullYear()

		if (clientYear !== year) {
			setYear(clientYear)
		}
	}, [year])

	return <>{year}</>
}
