"use client"

import { useState } from "react"
import {
	adminButtonClass,
	adminPanelClass,
	adminPanelDescriptionClass,
	adminPanelTitleClass,
	adminResultClass,
	adminWarningClass,
} from "@/components/admin/controlStyles"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { useAdminAction } from "@/components/admin/useAdminAction"

const LOG_TAG = "[admin:IndexNowPanel]"

/** Live region the buttons announce into; referenced by their `aria-controls`. */
const OUTCOME_ID = "indexnow-outcome"

type Action = "submit" | "dryrun"

/** One batch's status, mirrored from the API route's response. */
interface BatchResult {
	status: number
	ok: boolean
	message: string
	errorName: string | null
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
	/** URLs sent (or, on a dry run, that would be sent) — including rejected batches. */
	attempted: number
	/** URLs carried by batches IndexNow accepted. Absent on a dry run. */
	accepted: number
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

/** Distinct, actionable line for one failed batch, so the fix is obvious. */
function batchFailureReason(failed: BatchResult): string {
	const detail = failed.message ? ` — ${failed.message}` : ""

	switch (failed.status) {
		case 0:
			// `errorName` separates "the 10s timeout was too short" from "the
			// network is down"; the message alone is runtime-dependent prose.
			return failed.errorName === "TimeoutError"
				? `IndexNow did not respond in time${detail}`
				: `Could not reach IndexNow${detail}`
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

/**
 * One line per *distinct* failure across all batches, not just the first.
 * A partial failure (batch 1 accepted, batch 2 rejected) reported as a flat
 * error hides that some URLs did land — and hides a second, different reason
 * behind the first one.
 */
function batchFailureReasons(batches: BatchResult[]): string[] {
	const failed = batches.filter((batch) => !batch.ok)

	if (failed.length === 0) {
		return ["IndexNow rejected the submission."]
	}

	return [...new Set(failed.map(batchFailureReason))]
}

/**
 * A scrollable, truncating list of URLs — long lists stay contained.
 *
 * `tabIndex={0}` on the scroll container is load-bearing, not decorative: the
 * list holds no focusable children, so without it a keyboard-only user cannot
 * scroll past the first few URLs (WCAG 2.1.1). The `title` restores the full
 * URL that `truncate` clips.
 */
function UrlList({
	id,
	label,
	urls,
}: {
	id: string
	label: string
	urls: string[]
}) {
	const labelId = `${id}-label`

	return (
		<div className="flex flex-col gap-1">
			<p id={labelId} className="text-secondary text-xs font-medium">
				{label}
			</p>
			<div
				tabIndex={0}
				role="group"
				aria-labelledby={labelId}
				className="border-border max-h-48 overflow-y-auto rounded-md border p-2 focus-visible:outline-2 focus-visible:outline-(--color-accent)"
			>
				<ul className="text-secondary flex flex-col gap-0.5 font-mono text-xs">
					{urls.map((url) => (
						<li key={url} title={url} className="truncate">
							{url}
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

/**
 * What to render for a completed request — one variant per response shape.
 *
 * The error variant carries `warnings` and `preview` too: failure bodies ship
 * real diagnostics (the excluded-URL list on a 422, per-batch reasons on a 502)
 * and collapsing them to a single string throws away exactly what the operator
 * needs to act on.
 */
type Outcome =
	| {
			kind: "error"
			message: string
			warnings: string[]
			preview: Preview | null
	  }
	| { kind: "dryrun"; result: string; preview: Preview; warnings: string[] }
	| { kind: "submit"; result: string; warnings: string[] }

/**
 * The response body as JSON, or `null` when it's absent or not JSON at all
 * (a proxy error page, an empty 502). Consumes the body — call it once.
 */
async function readBody(
	response: Response
): Promise<Partial<IndexNowResponse> | null> {
	const raw = await response.text().catch(() => "")

	if (raw === "") {
		return null
	}

	try {
		return JSON.parse(raw) as Partial<IndexNowResponse>
	} catch {
		return null
	}
}

/**
 * Reads the response into an `Outcome`, keeping the action-specific branching
 * out of the component's request scaffolding (fetch/abort/state). Both success
 * and 4xx/5xx bodies are JSON; a non-JSON body falls back to the status text.
 * Success is action-specific: a real submit sets `ok`, a dry run sets `dryRun`
 * (a 200 even when it carries warnings).
 */
async function interpret(action: Action, response: Response): Promise<Outcome> {
	// Read the body ONCE. `readErrorMessage` would re-read it, and a spent body
	// makes its own `response.json()` throw — so its fallback string could never
	// win and every JSON failure degraded to a bare "Request failed (HTTP N)".
	const data = await readBody(response)

	const succeeded =
		response.ok &&
		data != null &&
		(action === "submit" ? data.ok === true : data.dryRun === true)

	if (!succeeded) {
		const reasons = data?.batches ? batchFailureReasons(data.batches) : []
		const message =
			reasons[0] ??
			data?.error ??
			`IndexNow request failed (HTTP ${response.status})`

		// A failure body still carries diagnostics: `skipped` on a 422, the
		// remaining per-batch reasons on a 502. Surface them beside the headline
		// instead of dropping them.
		const skippedOnError = data?.skipped ?? []

		return {
			kind: "error",
			message,
			warnings: [
				...reasons.slice(1),
				...(data?.warnings ?? []),
				...(skippedOnError.length > 0
					? [`Excluded ${countLabel(skippedOnError.length)} not on this host.`]
					: []),
			],
			preview:
				skippedOnError.length > 0
					? { urls: data?.urls ?? [], skipped: skippedOnError }
					: null,
		}
	}

	const skipped = data.skipped ?? []

	if (action === "dryrun") {
		const attempted = data.attempted ?? 0

		return {
			kind: "dryrun",
			result:
				`Dry run: ${countLabel(attempted)} would be submitted` +
				(skipped.length > 0 ? `, ${countLabel(skipped.length)} excluded` : ""),
			preview: { urls: data.urls ?? [], skipped },
			warnings: data.warnings ?? [],
		}
	}

	const attempted = data.attempted ?? 0
	const accepted = data.accepted ?? 0

	return {
		kind: "submit",
		// Report what IndexNow ACCEPTED, not what was sent. A partial acceptance
		// names both numbers so "47 submitted" can't stand in for a run where
		// most of the batches were rejected.
		result:
			accepted === attempted
				? `Submitted ${countLabel(accepted)} to IndexNow.`
				: `Submitted ${accepted} of ${countLabel(attempted)} to IndexNow.`,
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
	const [result, setResult] = useState<string | null>(null)
	const [warnings, setWarnings] = useState<string[]>([])
	const [preview, setPreview] = useState<Preview | null>(null)
	const { pending, isBusy, error, setError, run } = useAdminAction<Action>({
		logTag: LOG_TAG,
		networkErrorMessage:
			"IndexNow request failed (network error). Please retry.",
	})

	function start(action: Action): Promise<void> {
		const performRequest = async (signal: AbortSignal) => {
			const response = await fetch(
				`/api/admin/indexnow${action === "dryrun" ? "?dryRun" : ""}`,
				{ method: "POST", signal }
			)
			const outcome = await interpret(action, response)

			if (outcome.kind === "error") {
				// Only the network path used to log, so a contract change or an
				// unexpected body shape rendered a string with no console trace.
				// eslint-disable-next-line no-console
				console.warn(`${LOG_TAG} ${action} failed`, {
					status: response.status,
					message: outcome.message,
				})

				return () => {
					setError(outcome.message)
					setWarnings(outcome.warnings)
					setPreview(outcome.preview)
				}
			}

			return () => {
				setResult(outcome.result)
				setWarnings(outcome.warnings)

				if (outcome.kind === "dryrun") {
					setPreview(outcome.preview)
				}
			}
		}

		return run(action, performRequest, () => {
			setResult(null)
			setWarnings([])
			setPreview(null)
		})
	}

	return (
		<section className={adminPanelClass}>
			<div>
				<h2 className={adminPanelTitleClass}>Submit to IndexNow</h2>
				<p className={adminPanelDescriptionClass}>
					Pings participating search engines (Bing, Yandex, and others — not
					Google) to recrawl every URL in the sitemap. Safe to run after
					publishing or editing. Use <strong>Dry run</strong> first to preview
					the exact list without submitting.
				</p>
			</div>

			<div className="flex flex-wrap gap-2">
				<button
					type="button"
					onClick={() => start("dryrun")}
					disabled={isBusy}
					aria-busy={pending === "dryrun"}
					aria-controls={OUTCOME_ID}
					className={adminButtonClass}
				>
					{pending === "dryrun" ? "Checking…" : "Dry run"}
				</button>
				<button
					type="button"
					onClick={() => start("submit")}
					disabled={isBusy}
					aria-busy={pending === "submit"}
					aria-controls={OUTCOME_ID}
					className={adminButtonClass}
				>
					{pending === "submit" ? "Submitting…" : "Submit all URLs"}
				</button>
			</div>

			{/*
			 * Rendered unconditionally: a live region has to exist BEFORE its
			 * content arrives, or screen readers miss the update that mounts it.
			 * The outcome is the announcement that matters, so it lives here with
			 * the warnings rather than in a bare <p>.
			 */}
			<div
				id={OUTCOME_ID}
				role="status"
				aria-live="polite"
				className="flex flex-col gap-1 empty:hidden"
			>
				{result && <p className={adminResultClass}>{result}</p>}
				{warnings.map((message) => (
					<p key={message} className={adminWarningClass}>
						{message}
					</p>
				))}
			</div>

			{preview && preview.urls.length > 0 && (
				<UrlList
					id="indexnow-to-submit"
					label="To be submitted"
					urls={preview.urls}
				/>
			)}
			{preview && preview.skipped.length > 0 && (
				<UrlList
					id="indexnow-excluded"
					label="Excluded (off-host)"
					urls={preview.skipped}
				/>
			)}

			{error && <ErrorMessage size="sm">{error}</ErrorMessage>}
		</section>
	)
}
