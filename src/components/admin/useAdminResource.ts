"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"

/**
 * Reads a user-facing error message from a non-ok Response. Always appends the
 * HTTP status so the message is debuggable from the rendered UI without DevTools.
 *
 * Handles two response body shapes: `{ error: string }` (most handlers) and
 * `{ error: ZodIssue[] }` (the schema-validation 400 returned by `parseJsonBody`).
 * The array case is flattened to `path: message; path: message` so the rendered
 * error names the offending field instead of coercing to `[object Object]`.
 */
type ZodIssueLike = {
	path?: Array<string | number>
	message?: string
}

export async function readErrorMessage(
	response: Response,
	fallback: string
): Promise<string> {
	const statusSuffix = ` (HTTP ${response.status})`
	const contentType = response.headers.get("content-type") ?? ""

	if (!contentType.includes("application/json")) {
		return fallback + statusSuffix
	}

	try {
		const data = (await response.json()) as {
			error?: string | ZodIssueLike[]
		}

		if (Array.isArray(data.error)) {
			const formatted = formatZodIssues(data.error)

			return (formatted ?? fallback) + statusSuffix
		}

		return (data.error ?? fallback) + statusSuffix
	} catch {
		// Distinguish malformed JSON from the HTTP error itself.
		return "Request failed" + statusSuffix
	}
}

function formatZodIssues(issues: ZodIssueLike[]): string | null {
	const parts = issues.flatMap((issue) => {
		const message = issue.message

		if (message == null || message === "") {
			return []
		}

		const path = (issue.path ?? [])
			.filter((segment) => segment !== "")
			.join(".")

		return path === "" ? [message] : [`${path}: ${message}`]
	})

	if (parts.length === 0) {
		return null
	}

	return parts.join("; ")
}

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
	// Cancels any in-flight save/remove on unmount so the network call doesn't
	// outlive the form (relevant when the admin navigates away mid-PUT).
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		isMountedRef.current = true

		return () => {
			isMountedRef.current = false
			abortRef.current?.abort()
		}
	}, [])

	const isEditing = id !== null

	function goBackToAdmin() {
		router.push("/admin")
		router.refresh()
	}

	async function save(payload: TPayload): Promise<void> {
		setError(null)
		setIsSubmitting(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const url = isEditing
				? `/api/admin/${resource}/${id}`
				: `/api/admin/${resource}`
			const method = isEditing ? "PUT" : "POST"

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(payload),
				signal: controller.signal,
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

			// Aborts are silent: the unmount or a newer save already moved on.
			if (err instanceof Error && err.name === "AbortError") {
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

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch(`/api/admin/${resource}/${id}`, {
				method: "DELETE",
				signal: controller.signal,
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

			if (err instanceof Error && err.name === "AbortError") {
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
