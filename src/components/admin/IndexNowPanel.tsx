"use client"

import { useRef, useState } from "react"
import { adminButtonClass } from "@/components/admin/controlStyles"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { isAbortError } from "@/lib/client/isAbortError"
import { readErrorMessage } from "@/lib/client/readErrorMessage"

type Action = "submit" | "dryrun"

/** One batch's status, mirrored from the API route's response. */
interface BatchResult {
	status: number
	ok: boolean
	message: string
	count: number
}

/**
 * Union of the route's real-submit and dry-run payloads (all optional, since a
 * given response carries only one shape) plus the error field of the 4xx/5xx
 * bodies.
 */
interface IndexNowResponse {
	ok: boolean
	dryRun: boolean
	submitted: number
	urls: string[]
	skipped: string[]
	warnings: string[]
	batches: BatchResult[]
	error: string
}

/** The two lists a dry run returns, rendered for inspection before a real submit. */
interface Preview {
	urls: string[]
	skipped: string[]
}

function countLabel(count: number): string {
	return `${count} URL${count === 1 ? "" : "s"}`
}

/** Distinct, actionable line per IndexNow failure status, so the fix is obvious. */
function batchFailureReason(batches: BatchResult[]): string {
	const failed = batches.find((batch) => !batch.ok)

	if (!failed) {
		return "IndexNow rejected the submission."
	}

	const detail = failed.message ? ` — ${failed.message}` : ""

	switch (failed.status) {
		case 0:
			return `Could not reach IndexNow${detail}`
		case 403:
			return `IndexNow rejected the key (403). Check that /indexnow-key.txt is live and matches INDEXNOW_KEY${detail}`
		case 422:
			return `IndexNow rejected the URLs (422) — host/key mismatch${detail}`
		case 429:
			return `IndexNow rate-limited the submission (429). Try again later${detail}`
		default:
			return `IndexNow returned ${failed.status}${detail}`
	}
}

/** A scrollable, truncating list of URLs — long lists stay contained. */
function UrlList({ label, urls }: { label: string; urls: string[] }) {
	return (
		<div className="flex flex-col gap-1">
			<p className="text-secondary text-xs font-medium">{label}</p>
			<div className="border-border max-h-48 overflow-y-auto rounded-md border p-2">
				<ul className="text-secondary flex flex-col gap-0.5 font-mono text-xs">
					{urls.map((url) => (
						<li key={url} className="truncate">
							{url}
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

/** What to render for a completed request — one variant per response shape. */
type Outcome =
	| { kind: "error"; message: string }
	| { kind: "dryrun"; result: string; preview: Preview; warnings: string[] }
	| { kind: "submit"; result: string; warnings: string[] }

/**
 * Reads the response into an `Outcome`, keeping the action-specific branching
 * out of the component's request scaffolding (fetch/abort/state). Both success
 * and 4xx/5xx bodies are JSON; a non-JSON body falls back to the status text.
 * Success is action-specific: a real submit sets `ok`, a dry run sets `dryRun`
 * (a 200 even when it carries warnings).
 */
async function interpret(action: Action, response: Response): Promise<Outcome> {
	const data = (await response
		.json()
		.catch(() => null)) as Partial<IndexNowResponse> | null

	const succeeded =
		response.ok &&
		data != null &&
		(action === "submit" ? data.ok === true : data.dryRun === true)

	if (!succeeded) {
		const message =
			(data?.batches ? batchFailureReason(data.batches) : data?.error) ??
			(await readErrorMessage(response, "IndexNow request failed"))

		return { kind: "error", message }
	}

	const skipped = data.skipped ?? []

	if (action === "dryrun") {
		const submitted = data.submitted ?? 0

		return {
			kind: "dryrun",
			result:
				`Dry run: ${countLabel(submitted)} would be submitted` +
				(skipped.length > 0 ? `, ${countLabel(skipped.length)} excluded` : ""),
			preview: { urls: data.urls ?? [], skipped },
			warnings: data.warnings ?? [],
		}
	}

	return {
		kind: "submit",
		result: `Submitted ${countLabel(data.submitted ?? 0)} to IndexNow.`,
		warnings:
			skipped.length > 0
				? [
						`Skipped ${countLabel(skipped.length)} not on this host: ${skipped.join(", ")}`,
					]
				: [],
	}
}

/**
 * Submits every sitemap URL to IndexNow in one click. Companion to the
 * Revalidate panel: after publishing, ping the participating search engines
 * (Bing, Yandex, …; not Google) to recrawl. Hits the session-gated
 * `POST /api/admin/indexnow`, which reads the origin, key, and URL list
 * server-side — nothing to configure here.
 *
 * "Dry run" previews the exact list (and any off-host exclusions) without
 * submitting, and flags config problems as warnings.
 */
export default function IndexNowPanel() {
	const [pending, setPending] = useState<Action | null>(null)
	const [result, setResult] = useState<string | null>(null)
	const [warnings, setWarnings] = useState<string[]>([])
	const [preview, setPreview] = useState<Preview | null>(null)
	const [error, setError] = useState<string | null>(null)
	const abortRef = useRef<AbortController | null>(null)

	async function run(action: Action): Promise<void> {
		setResult(null)
		setWarnings([])
		setPreview(null)
		setError(null)
		setPending(action)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		// A newer click may have superseded this one; only the latest request
		// writes shared state.
		const isLatest = () => abortRef.current === controller

		try {
			const response = await fetch(
				`/api/admin/indexnow${action === "dryrun" ? "?dryRun" : ""}`,
				{ method: "POST", signal: controller.signal }
			)
			const outcome = await interpret(action, response)

			if (!isLatest()) {
				return
			}

			if (outcome.kind === "error") {
				setError(outcome.message)

				return
			}

			setResult(outcome.result)
			setWarnings(outcome.warnings)

			if (outcome.kind === "dryrun") {
				setPreview(outcome.preview)
			}
		} catch (err) {
			if (isAbortError(err) || abortRef.current !== controller) {
				return
			}

			// eslint-disable-next-line no-console
			console.warn("[admin:IndexNowPanel] request failed", err)
			setError("IndexNow request failed (network error). Please retry.")
		} finally {
			if (abortRef.current === controller) {
				setPending(null)
			}
		}
	}

	const isBusy = pending !== null

	return (
		<section className="border-border flex flex-col gap-3 rounded-lg border p-4">
			<div>
				<h2 className="text-primary text-sm font-semibold">
					Submit to IndexNow
				</h2>
				<p className="text-secondary mt-1 text-xs">
					Pings participating search engines (Bing, Yandex, and others — not
					Google) to recrawl every URL in the sitemap. Safe to run after
					publishing or editing. Use <strong>Dry run</strong> first to preview
					the exact list without submitting.
				</p>
			</div>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => run("dryrun")}
					disabled={isBusy}
					className={adminButtonClass}
				>
					{pending === "dryrun" ? "Checking…" : "Dry run"}
				</button>
				<button
					type="button"
					onClick={() => run("submit")}
					disabled={isBusy}
					className={adminButtonClass}
				>
					{pending === "submit" ? "Submitting…" : "Submit all URLs"}
				</button>
			</div>

			{result && <p className="text-secondary text-xs">{result}</p>}

			{warnings.length > 0 && (
				<div role="status" className="flex flex-col gap-1">
					{warnings.map((message) => (
						<p
							key={message}
							className="text-xs text-amber-600 dark:text-amber-400"
						>
							{message}
						</p>
					))}
				</div>
			)}

			{preview && preview.urls.length > 0 && (
				<UrlList label="To be submitted" urls={preview.urls} />
			)}
			{preview && preview.skipped.length > 0 && (
				<UrlList label="Excluded (off-host)" urls={preview.skipped} />
			)}

			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</section>
	)
}
