"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

interface Config {
	resource: "posts" | "projects"
	id: number | null
}

interface AdminResource<TPayload> {
	save: (payload: TPayload) => Promise<void>
	remove: () => Promise<void>
	isSubmitting: boolean
	error: string | null
}

export function useAdminResource<TPayload>({
	resource,
	id,
}: Config): AdminResource<TPayload> {
	const router = useRouter()
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	// Gates `setState` calls that fire after the caller has unmounted (e.g. the
	// admin navigated away while a PUT was in flight). Without this the React
	// dev-time warning is the only signal that the handler is updating a dead
	// component.
	const isMountedRef = useRef(true)

	useEffect(() => {
		isMountedRef.current = true

		return () => {
			isMountedRef.current = false
		}
	}, [])

	const isEditing = id !== null

	async function readErrorMessage(
		response: Response,
		fallback: string
	): Promise<string> {
		const contentType = response.headers.get("content-type") ?? ""

		if (!contentType.includes("application/json")) {
			return fallback
		}

		try {
			const data = (await response.json()) as { error?: string }

			return data.error ?? fallback
		} catch {
			// Distinguish malformed JSON from the HTTP error itself.
			return "Request failed"
		}
	}

	function goBackToAdmin() {
		router.push("/admin")
		router.refresh()
	}

	async function save(payload: TPayload): Promise<void> {
		setError(null)
		setIsSubmitting(true)

		try {
			const url = isEditing
				? `/api/admin/${resource}/${id}`
				: `/api/admin/${resource}`
			const method = isEditing ? "PUT" : "POST"

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
			})

			if (!response.ok) {
				const message = await readErrorMessage(
					response,
					"Something went wrong. Please try again."
				)
				throw new Error(message)
			}

			goBackToAdmin()
		} catch (err) {
			if (!isMountedRef.current) {
				return
			}

			setError(
				err instanceof Error
					? err.message
					: "Something went wrong. Please try again."
			)
		} finally {
			if (isMountedRef.current) {
				setIsSubmitting(false)
			}
		}
	}

	async function remove(): Promise<void> {
		if (!isEditing) {
			return
		}

		if (!window.confirm("Are you sure? This cannot be undone.")) {
			return
		}

		setError(null)
		setIsSubmitting(true)

		try {
			const response = await fetch(`/api/admin/${resource}/${id}`, {
				method: "DELETE",
			})

			if (!response.ok) {
				const message = await readErrorMessage(
					response,
					"Delete failed. Please try again."
				)
				throw new Error(message)
			}

			goBackToAdmin()
		} catch (err) {
			if (!isMountedRef.current) {
				return
			}

			setError(
				err instanceof Error ? err.message : "Delete failed. Please try again."
			)
		} finally {
			if (isMountedRef.current) {
				setIsSubmitting(false)
			}
		}
	}

	return { save, remove, isSubmitting, error }
}
