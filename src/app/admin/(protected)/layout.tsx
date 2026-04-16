import { redirect } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import { verifySession } from "@/lib/auth"

// Defense-in-depth: `src/proxy.ts` already gates this route, but a middleware
// matcher typo would silently expose the admin shell. Re-checking here keeps
// the layout safe even if that happens.
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
