"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"

export default function AdminNav() {
	const router = useRouter()
	const [error, setError] = useState<string | null>(null)
	const [isLoggingOut, setIsLoggingOut] = useState(false)

	async function handleLogout() {
		setError(null)
		setIsLoggingOut(true)

		try {
			const response = await fetch("/api/auth/logout", { method: "POST" })

			if (!response.ok) {
				// Hard server failure: the session cookie may still be alive on
				// the server. Surface the error and block the redirect so the
				// user knows they may need to retry instead of silently being
				// dropped on /admin/login while still logged in.
				setError(`Logout failed (HTTP ${response.status}). Please retry.`)
				setIsLoggingOut(false)

				return
			}
		} catch {
			// Network failure: the cookie may still be valid, but the request
			// never reached the server. Surface the error rather than silently
			// redirecting — same reasoning as above.
			setError("Logout failed (network error). Please retry.")
			setIsLoggingOut(false)

			return
		}

		router.push("/admin/login")
	}

	return (
		<header className="border-border border-b">
			<nav className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
				<Link
					href="/admin"
					className="text-primary font-semibold transition-opacity hover:opacity-75"
				>
					Admin
				</Link>

				<div className="flex items-center gap-6">
					<Link
						href="/admin/posts/new"
						className="text-secondary text-sm transition-colors hover:text-(--color-accent)"
					>
						New post
					</Link>
					<Link
						href="/admin/projects/new"
						className="text-secondary text-sm transition-colors hover:text-(--color-accent)"
					>
						New project
					</Link>
					<button
						onClick={handleLogout}
						disabled={isLoggingOut}
						className="text-secondary cursor-pointer text-sm transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Logout
					</button>
				</div>
			</nav>

			{error && (
				<ErrorMessage size="sm" className="mx-auto max-w-4xl px-4 pb-2">
					{error}
				</ErrorMessage>
			)}
		</header>
	)
}
