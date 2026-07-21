"use client"

import { useState } from "react"
import {
	adminButtonClass,
	adminInputClass,
	adminPanelClass,
	adminPanelDescriptionClass,
	adminPanelTitleClass,
	adminResultClass,
	adminWarningClass,
} from "@/components/admin/controlStyles"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useAdminAction } from "@/components/admin/useAdminAction"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

/** Live region the buttons announce into; referenced by their `aria-controls`. */
const OUTCOME_ID = "revalidate-outcome"

type ResourceKey = "posts" | "projects" | "guides"
type Action = `${ResourceKey}-all` | `${ResourceKey}-list`

type RevalidateBody = Partial<Record<ResourceKey, "all" | string[]>>

/** Entries the server declined to bust, with the reason to render verbatim. */
interface SkippedEntries {
	entries: string[]
	reason: string
}

/** Payload of `POST /api/admin/revalidate`: what was busted, dropped, or errored. */
interface RevalidateResponse {
	applied?: Partial<Record<ResourceKey, "all" | string[]>>
	skipped?: Partial<Record<ResourceKey, SkippedEntries>>
	/** Per-resource failure (207 Multi-Status); other resources may still apply. */
	errors?: Partial<Record<ResourceKey, string>>
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
	const [result, setResult] = useState<string | null>(null)
	const [warning, setWarning] = useState<string | null>(null)
	const { pending, isBusy, error, setError, run } = useAdminAction<Action>({
		logTag: "[admin:RevalidatePanel]",
		networkErrorMessage: "Revalidate failed (network error). Please retry.",
	})

	function start(
		action: Action,
		key: ResourceKey,
		noun: string,
		body: RevalidateBody
	): Promise<void> {
		const performRequest = async (signal: AbortSignal) => {
			const response = await fetch("/api/admin/revalidate", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal,
			})

			if (!response.ok && response.status !== 207) {
				const message = await readErrorMessage(response, "Revalidate failed")

				return () => setError(message)
			}

			// 207 Multi-Status: some resources may have errored while others applied.
			const data = (await response.json()) as RevalidateResponse

			if (data.errors?.[key]) {
				return () => setError(`Revalidating ${key} failed. Please retry.`)
			}

			// The label reports what the server APPLIED, not what was submitted —
			// entries the server dropped show up in the warning below instead.
			// Pretending they succeeded is how the 2026-07 stale-404 hid.
			const applied = data.applied?.[key]
			const skipped = data.skipped?.[key]

			return () => {
				setResult(
					applied === "all"
						? `All ${key} revalidated`
						: countLabel(noun, applied?.length ?? 0)
				)

				if (skipped != null && skipped.entries.length > 0) {
					setWarning(
						`Skipped (not busted): ${skipped.entries.join(", ")} — ${skipped.reason}`
					)
				}
			}
		}

		return run(action, performRequest, () => {
			setResult(null)
			setWarning(null)
		})
	}

	return (
		<section className={adminPanelClass}>
			<div>
				<h2 className={adminPanelTitleClass}>Revalidate caches</h2>
				<p className={adminPanelDescriptionClass}>
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
							onClick={() => start(`${key}-all`, key, noun, { [key]: "all" })}
							disabled={isBusy}
							aria-busy={pending === `${key}-all`}
							aria-controls={OUTCOME_ID}
							className={adminButtonClass}
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
							className={adminInputClass}
						/>
						<button
							type="button"
							onClick={() => start(`${key}-list`, key, noun, { [key]: tokens })}
							disabled={isBusy || tokens.length === 0}
							aria-busy={pending === `${key}-list`}
							aria-controls={OUTCOME_ID}
							className={adminButtonClass}
						>
							{pending === `${key}-list`
								? "Revalidating…"
								: "Revalidate listed"}
						</button>
					</div>
				)
			})}

			{/*
			 * Rendered unconditionally: a live region has to exist BEFORE its
			 * content arrives, or screen readers miss the update that mounts it.
			 */}
			<div
				id={OUTCOME_ID}
				role="status"
				aria-live="polite"
				className="flex flex-col gap-1 empty:hidden"
			>
				{result && <p className={adminResultClass}>{result}</p>}
				{warning && <p className={adminWarningClass}>{warning}</p>}
			</div>
			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</section>
	)
}
