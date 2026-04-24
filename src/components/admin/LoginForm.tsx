"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

export default function LoginForm() {
	const router = useRouter()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setIsSubmitting(true)

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
			})

			if (response.ok) {
				router.push("/admin")
				return
			}

			const data = await response.json().catch(() => ({}))
			setError(data.error ?? "Something went wrong. Please try again.")
		} catch {
			setError("Something went wrong. Please try again.")
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<label htmlFor="email" className="text-secondary text-sm font-medium">
					Email
				</label>
				<input
					id="email"
					type="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="admin-input disabled:opacity-50"
					disabled={isSubmitting}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="password"
					className="text-secondary text-sm font-medium"
				>
					Password
				</label>
				<input
					id="password"
					type="password"
					autoComplete="current-password"
					required
					value={password}
					onChange={(e) => setPassword(e.target.value)}
					className="admin-input disabled:opacity-50"
					disabled={isSubmitting}
				/>
			</div>

			{error && (
				<p className="text-sm text-red-500" role="alert">
					{error}
				</p>
			)}

			<button
				type="submit"
				disabled={isSubmitting}
				className="bg-accent mt-2 rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{isSubmitting ? "Signing in…" : "Sign in"}
			</button>
		</form>
	)
}
