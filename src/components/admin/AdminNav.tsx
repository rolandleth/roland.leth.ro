"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

export default function AdminNav() {
	const router = useRouter()

	async function handleLogout() {
		try {
			const response = await fetch("/api/auth/logout", { method: "POST" })

			if (!response.ok) {
				// eslint-disable-next-line no-console
				console.error(
					"[AdminNav:handleLogout] logout returned non-ok",
					response.status
				)
			}
		} catch (error) {
			// Network failure: the cookie may still be valid, but the user has
			// asked to leave. Log and still redirect so they're not trapped.
			// eslint-disable-next-line no-console
			console.error("[AdminNav:handleLogout] logout fetch failed", error)
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
						className="text-secondary cursor-pointer text-sm transition-colors hover:text-red-500"
					>
						Logout
					</button>
				</div>
			</nav>
		</header>
	)
}
