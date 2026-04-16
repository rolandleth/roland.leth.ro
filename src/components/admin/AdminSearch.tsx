"use client"

import { useRouter } from "next/navigation"
import ExpandableSearch from "@/components/ui/ExpandableSearch"

interface Props {
	tab: "posts" | "projects"
	query: string
}

export default function AdminSearch({ tab, query }: Props) {
	const router = useRouter()

	function handleSubmit(nextQuery: string) {
		const tabBase = tab === "posts" ? "/admin" : "/admin?tab=projects"
		const separator = tab === "posts" ? "?" : "&"

		router.push(`${tabBase}${separator}q=${encodeURIComponent(nextQuery)}`)
	}

	return (
		<ExpandableSearch
			placeholder="Search…"
			onSubmit={handleSubmit}
			initialValue={query}
			className="ml-auto"
		/>
	)
}
