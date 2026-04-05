import AdminNav from "@/components/admin/AdminNav"

export default function ProtectedLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="min-h-screen">
			<AdminNav />
			<main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
		</div>
	)
}
