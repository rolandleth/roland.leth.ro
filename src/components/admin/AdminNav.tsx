"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

export default function AdminNav() {
	const router = useRouter()
	const [error, setError] = useState<string | null>(null)
	const [isLoggingOut, setIsLoggingOut] = useState(false)
	const [isKeepaliveRunning, setIsKeepaliveRunning] = useState(false)
	const [keepaliveResult, setKeepaliveResult] = useState<string | null>(null)

	// Cancel an in-flight logout on unmount so it doesn't outlive the component.
	// Same shape as `useAdminResource` and the other admin mutations.
	const abortRef = useRef<AbortController | null>(null)
	// Separate controller so a click on "Run keepalive" doesn't supersede an
	// in-flight logout (and vice versa) — these are independent operations.
	const keepaliveAbortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		return () => {
			abortRef.current?.abort()
			keepaliveAbortRef.current?.abort()
		}
	}, [])

	async function handleKeepalive() {
		setError(null)
		setKeepaliveResult(null)
		setIsKeepaliveRunning(true)

		const controller = new AbortController()
		keepaliveAbortRef.current?.abort()
		keepaliveAbortRef.current = controller

		try {
			const response = await fetch("/api/admin/keepalive", {
				method: "POST",
				signal: controller.signal,
			})

			if (!response.ok) {
				const message = await readErrorMessage(response, "Keepalive failed")
				setError(message)

				return
			}

			const data = (await response.json()) as { ok: boolean; value: string }
			setKeepaliveResult(data.value)
		} catch (err) {
			if (isAbortError(err)) {
				return
			}

			// eslint-disable-next-line no-console
			console.warn("[admin:AdminNav] keepalive failed", err)
			setError("Keepalive failed (network error). Please retry.")
		} finally {
			if (keepaliveAbortRef.current === controller) {
				setIsKeepaliveRunning(false)
			}
		}
	}

	async function handleLogout() {
		setError(null)
		setIsLoggingOut(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch("/api/auth/logout", {
				method: "POST",
				signal: controller.signal,
			})

			if (!response.ok) {
				if (response.status === 401) {
					// Session is already dead on the server — redirect directly
					// rather than showing a retry message.
					router.push("/admin/login")

					return
				}

				// Hard server failure: the session cookie may still be alive on
				// the server. Surface the error and block the redirect so the
				// user knows they may need to retry instead of silently being
				// dropped on /admin/login while still logged in. Route through
				// the shared reader so the body's `{ error }` shows up alongside
				// the `(HTTP NNN)` suffix, matching the rest of the admin UI.
				const message = await readErrorMessage(response, "Logout failed")
				setError(`${message} Please retry.`)

				return
			}

			router.push("/admin/login")
		} catch (err) {
			// Swallow user-initiated aborts (unmount mid-request).
			if (isAbortError(err)) {
				return
			}

			// Network failure: the cookie may still be valid, but the request
			// never reached the server. Tagged warn so a flapping logout is
			// visible in the browser DevTools console; this is a `"use client"`
			// component so the warn does NOT reach Vercel server logs (would
			// need a `/api/log` hop for that).
			// eslint-disable-next-line no-console
			console.warn("[admin:AdminNav] logout failed", err)
			setError("Logout failed (network error). Please retry.")
		} finally {
			// Same supersession guard as `LoginForm.handleSubmit` and the inline
			// admin mutations: only reset `isLoggingOut` if this controller is
			// still the latest. Without the guard, a stale handler firing after
			// a newer logout started would re-enable the button mid-flight.
			if (abortRef.current === controller) {
				setIsLoggingOut(false)
			}
		}
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
						onClick={handleKeepalive}
						disabled={isKeepaliveRunning}
						className="text-secondary cursor-pointer text-sm transition-colors hover:text-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50"
					>
						{isKeepaliveRunning ? "Running…" : "Run keepalive"}
					</button>
					<button
						onClick={handleLogout}
						disabled={isLoggingOut}
						className="text-secondary cursor-pointer text-sm transition-colors hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Logout
					</button>
				</div>
			</nav>

			{keepaliveResult && (
				<p className="text-secondary mx-auto max-w-4xl px-4 pb-2 text-xs">
					Keepalive OK — wrote{" "}
					<code className="font-mono">{keepaliveResult}</code>
				</p>
			)}

			{error && (
				<ErrorMessage size="sm" className="mx-auto max-w-4xl px-4 pb-2">
					{error}
				</ErrorMessage>
			)}
		</header>
	)
}
