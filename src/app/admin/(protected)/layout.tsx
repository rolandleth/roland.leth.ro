import { redirect } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import { verifySession } from "@/lib/auth"

// The real gate is `src/proxy.ts` (middleware) — `generateMetadata` functions
// inside nested admin pages run independently of this layout and already touch
// the DB before any check here, so this layout is not a complete backstop.
// Re-checking here still protects the rendered page body (not metadata) in the
// narrow case where a future middleware matcher typo lets a request through.
export default async function ProtectedLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const isAuthenticated = await verifySession()

	if (!isAuthenticated) {
		redirect("/admin/login")
	}

	return (
		<div className="min-h-screen">
			<AdminNav />
			<main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
		</div>
	)
}
