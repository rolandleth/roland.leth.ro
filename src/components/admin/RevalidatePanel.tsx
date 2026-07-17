"use client"

import { useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

type ResourceKey = "posts" | "projects" | "guides"
type Action = `${ResourceKey}-all` | `${ResourceKey}-list`

type RevalidateBody = Partial<Record<ResourceKey, "all" | string[]>>

/** Success payload of `POST /api/admin/revalidate`: what was busted vs dropped. */
interface RevalidateResponse {
	applied?: Partial<Record<ResourceKey, "all" | string[]>>
	skipped?: Partial<Record<ResourceKey, string[]>>
}

interface ResourceConfig {
	key: ResourceKey
	/** Singular, for the "N posts revalidated" result line. */
	noun: string
	placeholder: string
	ariaLabel: string
}

// One row per resource, driven by config — the three rows are identical apart
// from their labels, and hand-rolling each is how the second one ended up with
// a subtly different aria-label.
const RESOURCES: readonly ResourceConfig[] = [
	{
		key: "posts",
		noun: "post",
		placeholder: "tech/my-post, life/another",
		ariaLabel: "Post slugs to revalidate (section/slug)",
	},
	{
		key: "projects",
		noun: "project",
		placeholder: "capsule, logbook",
		ariaLabel: "Project slugs to revalidate",
	},
	{
		key: "guides",
		noun: "guide",
		placeholder: "how-to-keep-a-decision-journal, making-better-decisions",
		ariaLabel: "Guide or topic slugs to revalidate",
	},
]

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
 * Posts are `section/slug`; projects and guides are bare slugs (a guide and a
 * topic hub share one namespace, so either kind goes in the guides box). Hits
 * the session-gated `POST /api/admin/revalidate`.
 */
export default function RevalidatePanel() {
	const [inputs, setInputs] = useState<Record<ResourceKey, string>>({
		posts: "",
		projects: "",
		guides: "",
	})
	const [pending, setPending] = useState<Action | null>(null)
	const [result, setResult] = useState<string | null>(null)
	const [warning, setWarning] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	async function run(
		action: Action,
		key: ResourceKey,
		noun: string,
		body: RevalidateBody
	): Promise<void> {
		setResult(null)
		setWarning(null)
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

			// The label reports what the server APPLIED, not what was submitted —
			// entries the server dropped show up in the warning below instead.
			// Pretending they succeeded is how the 2026-07 stale-404 hid.
			const data = (await response.json()) as RevalidateResponse
			const applied = data.applied?.[key]
			const skipped = data.skipped?.[key] ?? []

			setResult(
				applied === "all"
					? `All ${key} revalidated`
					: countLabel(noun, applied?.length ?? 0)
			)

			if (skipped.length > 0) {
				setWarning(
					`Skipped (not busted): ${skipped.join(", ")} — post entries must be section/slug`
				)
			}
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
					, projects and guides as slugs. The &ldquo;All&rdquo; buttons refresh
					every detail page of that type.
				</p>
			</div>

			{RESOURCES.map(({ key, noun, placeholder, ariaLabel }) => {
				const tokens = parseTokens(inputs[key])

				return (
					<div key={key} className="flex flex-wrap items-center gap-2">
						<button
							type="button"
							onClick={() => run(`${key}-all`, key, noun, { [key]: "all" })}
							disabled={isBusy}
							className={buttonClass}
						>
							{pending === `${key}-all` ? "Revalidating…" : `All ${key}`}
						</button>
						<input
							type="text"
							value={inputs[key]}
							onChange={(event) =>
								setInputs((prev) => ({ ...prev, [key]: event.target.value }))
							}
							placeholder={placeholder}
							aria-label={ariaLabel}
							className={inputClass}
						/>
						<button
							type="button"
							onClick={() => run(`${key}-list`, key, noun, { [key]: tokens })}
							disabled={isBusy || tokens.length === 0}
							className={buttonClass}
						>
							{pending === `${key}-list`
								? "Revalidating…"
								: "Revalidate listed"}
						</button>
					</div>
				)
			})}

			{result && <p className="text-secondary text-xs">{result}</p>}
			{warning && (
				<p role="status" className="text-xs text-amber-600 dark:text-amber-400">
					{warning}
				</p>
			)}
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</section>
	)
}
