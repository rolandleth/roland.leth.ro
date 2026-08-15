import { redirect } from "next/navigation"
import AdminNav from "@/components/admin/AdminNav"
import { verifySession } from "@/lib/auth/auth"
import { logMiddlewareBypass } from "@/lib/auth/middlewareBypass"

// The real gate is `src/proxy.ts` (middleware); re-checking here protects the
// rendered page body in the narrow case where a future matcher typo lets a
// request through. This layout covers the body only — `generateMetadata` in a
// nested page runs independently of it, so a page that loads data there has to
// carry its own check (`adminEditMetadata` does this for the edit pages).
export default async function ProtectedLayout({
	children,
}: {
	children: React.ReactNode
}) {
	const isAuthenticated = await verifySession()

	if (!isAuthenticated) {
		// The redirect alone is indistinguishable from a normal login bounce, so
		// the line is what makes a matcher hole visible. On a bypassed edit page
		// this fires alongside `adminEditMetadata`'s; `bypassId` is what joins the
		// two into one event.
		logMiddlewareBypass("[admin:layout]", "the protected layout")

		redirect("/admin/login")
	}

	return (
		<div className="min-h-screen">
			<AdminNav />
			<div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
		</div>
	)
}
