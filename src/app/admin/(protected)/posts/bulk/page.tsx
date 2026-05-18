import PostBulkImport from "@/components/admin/PostBulkImport"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Bulk import posts",
}

export default function BulkImportPage() {
	return <PostBulkImport />
}
