"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

export default function LoginForm() {
	const router = useRouter()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [isSubmitting, setIsSubmitting] = useState(false)

	// Mirror the abort discipline used by `useAdminResource` and the inline
	// admin mutations (`IsFeaturedToggle`, `ImageUpload`, `ProjectSortOrderInput`):
	// cancel any in-flight login on unmount so a navigation away mid-POST
	// doesn't leave a dangling request, and a second submit supersedes the first.
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		return () => {
			abortRef.current?.abort()
		}
	}, [])

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()
		setError(null)
		setIsSubmitting(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email, password }),
				signal: controller.signal,
			})

			if (response.ok) {
				// `refresh()` re-runs the server component tree so the RSC cache
				// picks up the new session cookie before the navigation lands —
				// otherwise the admin shell can briefly render unauthenticated
				// state on slow networks. Same pattern as `useAdminResource`.
				router.push("/admin")
				router.refresh()
				return
			}

			// Route the body through the shared reader so login surfaces stay in
			// step with the rest of the admin UI: handles `string` + `ZodIssue[]`
			// shapes, appends `(HTTP NNN)`, falls back on JSON-parse failure.
			const message = await readErrorMessage(
				response,
				"Something went wrong. Please try again."
			)
			setError(message)
		} catch (err) {
			// Swallow user-initiated aborts (unmount mid-request, repeated submit).
			if (isAbortError(err)) {
				return
			}

			// Network/JSON-parse failure: previously this catch was bare and the
			// error was completely opaque. Tagged warn so a flapping login is
			// visible in the browser DevTools console for the admin debugging
			// locally; this is a `"use client"` component so the warn does NOT
			// reach Vercel server logs (would need a `/api/log` hop for that).
			// eslint-disable-next-line no-console
			console.warn("[admin:LoginForm] submit failed", err)
			setError("Something went wrong. Please try again.")
		} finally {
			if (abortRef.current === controller) {
				setIsSubmitting(false)
			}
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

			{error && <ErrorMessage>{error}</ErrorMessage>}

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
