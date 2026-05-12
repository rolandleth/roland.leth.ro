import { redirect } from "next/navigation"
import LoginForm from "@/components/admin/LoginForm"
import { verifySession } from "@/lib/auth"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Login",
}

export default async function LoginPage() {
	const isAuthenticated = await verifySession()

	if (isAuthenticated) {
		redirect("/admin")
	}

	return (
		<div className="flex min-h-screen items-center justify-center px-4">
			<div className="w-full max-w-sm">
				<h1 className="text-primary mb-8 text-center text-2xl font-semibold">
					Admin
				</h1>
				<LoginForm />
			</div>
		</div>
	)
}
