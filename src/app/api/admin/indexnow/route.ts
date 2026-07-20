import { NextResponse } from "next/server"
import sitemap from "@/app/sitemap"
import { EnvConfigError, getIndexNowKey, getSiteUrl } from "@/lib/auth/env"
import {
	INDEXNOW_ENDPOINT,
	type IndexNowResult,
	findForeignHostUrls,
	isSubmittableOrigin,
	submitToIndexNow,
} from "@/lib/content/indexnow"

const TAG = "[api:admin:indexnow]"

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
export async function POST(request: Request): Promise<NextResponse> {
	const isDryRun = new URL(request.url).searchParams.has("dryRun")
	const key = getIndexNowKey()

	let base: string

	try {
		base = getSiteUrl()
	} catch (error) {
		if (error instanceof EnvConfigError) {
			return NextResponse.json({ error: error.message }, { status: 500 })
		}

		throw error
	}

	const isPublicOrigin = isSubmittableOrigin(base)
	const host = new URL(base).host
	const keyLocation = `${base}/indexnow-key.txt`

	const urls = (await sitemap())
		.map((entry) => entry.url)
		.filter((url): url is string => typeof url === "string")

	// Off-host URLs would sink the whole batch (IndexNow 422). The sitemap is
	// same-origin by construction, so any here signal a misconfiguration — report
	// them instead of silently submitting a doomed batch.
	const foreign = findForeignHostUrls(host, urls)
	const onHost = urls.filter((url) => !foreign.includes(url))

	if (isDryRun) {
		const warnings: string[] = []

		if (key === null) {
			warnings.push(
				"INDEXNOW_KEY is not configured — a real submission will fail."
			)
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
	if (key === null) {
		return NextResponse.json(
			{ error: "INDEXNOW_KEY is not configured for this deployment." },
			{ status: 400 }
		)
	}

	// A dev/preview origin (http, localhost) would submit URLs no crawler can
	// reach; refuse rather than fire a batch IndexNow will 422.
	if (!isPublicOrigin) {
		return NextResponse.json(
			{ error: `Refusing to submit non-public origin: ${base}` },
			{ status: 400 }
		)
	}

	if (onHost.length === 0) {
		return NextResponse.json(
			{ error: "No submittable URLs for this host.", skipped: foreign },
			{ status: 400 }
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
	const payload = {
		attempted: result.attempted,
		accepted: result.accepted,
		skipped,
		statuses: result.batches.map((batch) => batch.status),
	}

	if (result.ok) {
		// eslint-disable-next-line no-console
		console.info(`${TAG} success`, payload)

		return
	}

	// eslint-disable-next-line no-console
	console.error(`${TAG} upstream-error`, payload)
}
