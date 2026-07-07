"use client"

import { useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

type Action = "posts-all" | "posts-list" | "projects-all" | "projects-list"

interface RevalidateBody {
	posts?: "all" | string[]
	projects?: "all" | string[]
}

const buttonClass =
	"border-border cursor-pointer rounded-md border px-3 py-1.5 text-sm text-secondary transition-colors hover:text-(--color-accent) disabled:cursor-not-allowed disabled:opacity-50"

const inputClass =
	"border-border bg-background text-primary min-w-0 flex-1 rounded-md border px-2 py-1.5 font-mono text-sm"

/** Splits a pasted list on commas / whitespace / newlines into non-empty tokens. */
function parseTokens(raw: string): string[] {
	return raw
		.split(/[\s,]+/)
		.map((token) => token.trim())
		.filter((token) => token.length > 0)
}

function countLabel(noun: string, count: number): string {
	return `${count} ${noun}${count === 1 ? "" : "s"} revalidated`
}

/**
 * Admin utility for busting caches after a direct-Prisma script import (which
 * can't bust `unstable_cache` tags itself). Paste the slugs the import script
 * prints to refresh only those pages, or use the "All" buttons as a fallback.
 * Posts are `section/slug`; projects are bare slugs. Hits the session-gated
 * `POST /api/admin/revalidate`.
 */
export default function RevalidatePanel() {
	const [postsInput, setPostsInput] = useState("")
	const [projectsInput, setProjectsInput] = useState("")
	const [pending, setPending] = useState<Action | null>(null)
	const [result, setResult] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	async function run(
		action: Action,
		body: RevalidateBody,
		successLabel: string
	): Promise<void> {
		setResult(null)
		setError(null)
		setPending(action)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			const response = await fetch("/api/admin/revalidate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: controller.signal,
			})

			if (!response.ok) {
				setError(await readErrorMessage(response, "Revalidate failed"))

				return
			}

			setResult(successLabel)
		} catch (err) {
			if (isAbortError(err)) {
				return
			}

			// eslint-disable-next-line no-console
			console.warn("[admin:RevalidatePanel] revalidate failed", err)
			setError("Revalidate failed (network error). Please retry.")
		} finally {
			// Supersession guard, same as the other admin mutations: only clear the
			// pending flag if this is still the latest request.
			if (abortRef.current === controller) {
				setPending(null)
			}
		}
	}

	const postsTokens = parseTokens(postsInput)
	const projectsTokens = parseTokens(projectsInput)
	const isBusy = pending !== null

	return (
		<section className="border-border flex flex-col gap-4 rounded-lg border p-4">
			<div>
				<h2 className="text-primary text-sm font-semibold">
					Revalidate caches
				</h2>
				<p className="text-secondary mt-1 text-xs">
					After a script import, paste the slugs it printed to refresh only
					those pages — posts as <code className="font-mono">section/slug</code>
					, projects as slugs. The &ldquo;All&rdquo; buttons refresh every
					detail page of that type.
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() =>
						run("posts-all", { posts: "all" }, "All posts revalidated")
					}
					disabled={isBusy}
					className={buttonClass}
				>
					{pending === "posts-all" ? "Revalidating…" : "All posts"}
				</button>
				<input
					type="text"
					value={postsInput}
					onChange={(event) => setPostsInput(event.target.value)}
					placeholder="tech/my-post, life/another"
					aria-label="Post slugs to revalidate (section/slug)"
					className={inputClass}
				/>
				<button
					type="button"
					onClick={() =>
						run(
							"posts-list",
							{ posts: postsTokens },
							countLabel("post", postsTokens.length)
						)
					}
					disabled={isBusy || postsTokens.length === 0}
					className={buttonClass}
				>
					{pending === "posts-list" ? "Revalidating…" : "Revalidate listed"}
				</button>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={() =>
						run("projects-all", { projects: "all" }, "All projects revalidated")
					}
					disabled={isBusy}
					className={buttonClass}
				>
					{pending === "projects-all" ? "Revalidating…" : "All projects"}
				</button>
				<input
					type="text"
					value={projectsInput}
					onChange={(event) => setProjectsInput(event.target.value)}
					placeholder="capsule, logbook"
					aria-label="Project slugs to revalidate"
					className={inputClass}
				/>
				<button
					type="button"
					onClick={() =>
						run(
							"projects-list",
							{ projects: projectsTokens },
							countLabel("project", projectsTokens.length)
						)
					}
					disabled={isBusy || projectsTokens.length === 0}
					className={buttonClass}
				>
					{pending === "projects-list" ? "Revalidating…" : "Revalidate listed"}
				</button>
			</div>

			{result && <p className="text-secondary text-xs">{result}</p>}
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</section>
	)
}
