"use client"

import { useRouter } from "next/navigation"
import ExpandableSearch from "@/components/ui/ExpandableSearch"
import { buildAdminPageUrl, type AdminTab } from "@/lib/client/adminPageUrl"

interface Props {
	tab: AdminTab
	query: string
}

export default function AdminSearch({ tab, query }: Props) {
	const router = useRouter()

	// URLs come from `buildAdminPageUrl` rather than a per-tab ternary: this
	// hand-rolled its own `tab === "posts" ? … : …` string until a third tab
	// existed and silently pointed every guides search at the projects list.
	function handleSubmit(nextQuery: string) {
		router.push(buildAdminPageUrl({ tab, query: nextQuery, page: 1 }))
	}

	function handleClose() {
		if (query.length === 0) {
			return
		}

		router.replace(buildAdminPageUrl({ tab, query: "", page: 1 }))
	}

	// Keyed by tab: a tab switch is a client navigation that keeps this
	// instance, and `ExpandableSearch` reads `initialValue` only on mount, so
	// the previous tab's term would otherwise stay open in the box.
	return (
		<ExpandableSearch
			key={tab}
			placeholder="Search…"
			onSubmit={handleSubmit}
			onClose={handleClose}
			initialValue={query}
			className="ml-auto"
		/>
	)
}
