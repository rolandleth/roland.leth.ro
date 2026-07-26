import { NextResponse } from "next/server"
import sitemap from "@/app/sitemap"
import { requireAdmin } from "@/lib/api/requireAdmin"
import {
	EnvConfigError,
	getIndexNowKey,
	getSiteUrl,
	isValidIndexNowKey,
} from "@/lib/auth/env"
import {
	INDEXNOW_ENDPOINT,
	type IndexNowResult,
	findForeignHostUrls,
	isSubmittableOrigin,
	submitToIndexNow,
} from "@/lib/content/indexnow"

const TAG = "[api:admin:indexnow]"

/**
 * True when `?dryRun` asks for a preview. Presence alone enables it (`?dryRun`),
 * but an explicit falsy value turns it off — `?dryRun=false` reading as "yes,
 * preview" would hand back a 200 that looks like a completed submission.
 */
function isDryRunRequest(request: Request): boolean {
	const value = new URL(request.url).searchParams.get("dryRun")

	if (value === null) {
		return false
	}

	return !["false", "0", "no", "off"].includes(value.trim().toLowerCase())
}

/**
 * Why this deploy's key can't be used, or `null` when it can. One source for
 * both the dry run's warning and the real path's 503, so the two can't drift.
 *
 * The malformed case is checked here rather than in the env schema on purpose:
 * `readEnv()` aggregates every schema issue into a single throw, so a regex
 * there would take login and site-URL resolution down over a typo in an
 * optional, single-feature var.
 */
function describeKeyProblem(key: string | null): string | null {
	if (key === null) {
		return "INDEXNOW_KEY is not configured for this deployment."
	}

	if (!isValidIndexNowKey(key)) {
		return "INDEXNOW_KEY is set but malformed: must be 8–128 chars of [a-zA-Z0-9-]."
	}

	return null
}

// Session-gated by `src/proxy.ts` (every `/api/admin/*` request needs a valid
// JWT cookie). Submits every URL in the sitemap to IndexNow in one action.
//
// Running here — in the deploy — rather than from a local script is deliberate:
// `getSiteUrl()` resolves to the real production origin and the DB is prod, so
// there's no `vercel env pull` step and no way to accidentally announce
// localhost URLs. The sitemap is the single source of truth for "every
// indexable URL", so new posts/projects/guides are picked up with no upkeep.
//
// `?dryRun` previews what would be sent — the on-host URL list and any excluded
// off-host ones — without POSTing to IndexNow. It reports config problems
// (missing key, non-public origin, empty list) as `warnings` rather than 4xx-ing
// so the list stays previewable before the setup is finished; the real POST
// hard-fails on those instead.
/**
 * The site's base URL, or the 500 response to return when it isn't configured.
 * Extracted from `POST` so the handler reads as a flat sequence of guards.
 * An unexpected (non-config) failure still escapes after being logged — that
 * is a bug, not a misconfiguration, and shouldn't be reported as one.
 */
function resolveBaseUrl(): string | NextResponse {
	try {
		return getSiteUrl()
	} catch (error) {
		if (error instanceof EnvConfigError) {
			// eslint-disable-next-line no-console
			console.error(`${TAG} site URL is not configured`, error)

			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		// eslint-disable-next-line no-console
		console.error(`${TAG} unexpected error resolving the site URL`, error)

		throw error
	}
}

export async function POST(request: Request): Promise<NextResponse> {
	const unauthorized = await requireAdmin(TAG)

	if (unauthorized) {
		return unauthorized
	}

	const isDryRun = isDryRunRequest(request)
	const key = getIndexNowKey()
	const keyProblem = describeKeyProblem(key)
	const base = resolveBaseUrl()

	if (base instanceof NextResponse) {
		return base
	}

	const isPublicOrigin = isSubmittableOrigin(base)
	const host = new URL(base).host
	const keyLocation = `${base}/indexnow-key.txt`

	let urls: string[]

	try {
		urls = (await sitemap())
			.map((entry) => entry.url)
			.filter((url): url is string => typeof url === "string")
	} catch (error) {
		// `sitemap()` hits the DB. Without this the throw escapes as a framework
		// 500 with no `{error}` body — a shape the panel can't parse — and nothing
		// in the log to say the DB was the cause.
		// eslint-disable-next-line no-console
		console.error(`${TAG} could not build the URL list`, error)

		return NextResponse.json(
			{ error: "Could not read the sitemap. Please retry." },
			{ status: 503 }
		)
	}

	// Off-host URLs would sink the whole batch (IndexNow 422). The sitemap is
	// same-origin by construction, so any here signal a misconfiguration — report
	// them instead of silently submitting a doomed batch.
	const foreign = findForeignHostUrls(host, urls)
	const foreignSet = new Set(foreign)
	const onHost = urls.filter((url) => !foreignSet.has(url))

	if (isDryRun) {
		const warnings: string[] = []

		if (keyProblem !== null) {
			warnings.push(`${keyProblem} A real submission will fail.`)
		}

		if (!isPublicOrigin) {
			warnings.push(
				`Origin ${base} is not public — a real submission is blocked.`
			)
		}

		if (onHost.length === 0) {
			warnings.push("No submittable URLs for this host.")
		}

		// eslint-disable-next-line no-console
		console.info(`${TAG} dry-run`, {
			attempted: onHost.length,
			skipped: foreign.length,
			warnings: warnings.length,
		})

		return NextResponse.json({
			dryRun: true,
			endpoint: INDEXNOW_ENDPOINT,
			host,
			keyLocation,
			attempted: onHost.length,
			urls: onHost,
			skipped: foreign,
			warnings,
		})
	}

	// Real submission: hard-fail on the same problems the dry run only warns about.
	//
	// 503, not 400: the request is well-formed and nothing the caller sends can
	// fix it — it's a gap in this deploy's config. Matches `keepalive`'s 503 for
	// "Redis is not configured on this deploy".
	// The `key === null` arm is redundant with `keyProblem` but narrows the type
	// for the submission below, which needs a `string`.
	if (keyProblem !== null || key === null) {
		const message =
			keyProblem ?? "INDEXNOW_KEY is not configured for this deployment."

		// eslint-disable-next-line no-console
		console.error(`${TAG} ${message}`)

		return NextResponse.json({ error: message }, { status: 503 })
	}

	// A dev/preview origin (http, localhost) would submit URLs no crawler can
	// reach; refuse rather than fire a batch IndexNow will 422. Also a deploy
	// property rather than a caller mistake, so 503 here too.
	if (!isPublicOrigin) {
		return NextResponse.json(
			{ error: `Refusing to submit non-public origin: ${base}` },
			{ status: 503 }
		)
	}

	// 422, not 503: the sitemap resolved fine, it just yielded nothing this host
	// can claim — a content/config mismatch the `skipped` list explains.
	if (onHost.length === 0) {
		return NextResponse.json(
			{ error: "No submittable URLs for this host.", skipped: foreign },
			{ status: 422 }
		)
	}

	const result = await submitToIndexNow({
		key,
		keyLocation,
		host,
		urls: onHost,
	})

	logResult(result, foreign.length)

	// 200 when every batch was accepted; 502 when IndexNow rejected one (bad key
	// file, rate limit, …) so the panel can surface the upstream status. The
	// batch details ride along either way.
	return NextResponse.json(
		{
			ok: result.ok,
			endpoint: INDEXNOW_ENDPOINT,
			attempted: result.attempted,
			accepted: result.accepted,
			skipped: foreign,
			batches: result.batches,
		},
		{ status: result.ok ? 200 : 502 }
	)
}

/**
 * Failures log at `error` so they're visible to an error-level filter — a
 * rejected submission logged at `info` alongside successes is invisible exactly
 * when someone is looking for it. Matches `keepalive`'s split.
 */
function logResult(result: IndexNowResult, skipped: number): void {
	const counts = {
		attempted: result.attempted,
		accepted: result.accepted,
		skipped,
	}

	if (result.ok) {
		// eslint-disable-next-line no-console
		console.info(`${TAG} success`, {
			...counts,
			statuses: result.batches.map((batch) => batch.status),
		})

		return
	}

	// A rejected batch reports `status: 0` for any transport failure, so the
	// status alone can't tell a timeout from a DNS error. Log each batch's
	// `errorName`/`message` too — otherwise the one place someone looks after a
	// failed submission says nothing about why it failed.
	// eslint-disable-next-line no-console
	console.error(`${TAG} upstream-error`, {
		...counts,
		batches: result.batches.map((batch) => ({
			status: batch.status,
			errorName: batch.errorName,
			message: batch.message,
		})),
	})
}
