import type { Metadata } from "next"
import PostBulkImport from "@/components/admin/PostBulkImport"

export const metadata: Metadata = {
	title: "Bulk import posts",
}

export default function BulkImportPage() {
	return <PostBulkImport />
}
