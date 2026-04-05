"use client"

import { usePathname } from "next/navigation"
import Header from "@/components/Header"

export default function SiteChrome() {
	const pathname = usePathname()
	const isProtectedAdmin =
		pathname.startsWith("/admin") && pathname !== "/admin/login"

	if (isProtectedAdmin || pathname === "/") {
		return null
	}

	return (
		<>
			<Header />
			<div className="h-14" />
		</>
	)
}
