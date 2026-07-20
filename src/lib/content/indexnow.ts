// IndexNow submission — pure, transport-agnostic core. Kept free of `next`,
// env, and DB imports so the payload shape, host guard, chunking, and response
// interpretation are unit-testable with a fake `fetch`; the admin route wires
// it to the real origin, key, and sitemap URLs.
//
// IndexNow lets a site tell participating search engines (Bing, Yandex, Seznam,
// Naver, Yep, …) which URLs to (re)crawl. Google does NOT participate. One POST
// to the vendor-neutral endpoint is shared across every participating engine —
// see https://www.indexnow.org/faq — so a single submission is enough.

/**
 * Vendor-neutral endpoint. A submission here is fanned out to every
 * participating search engine, so per-engine hosts (bing.com, yandex.com) are
 * unnecessary.
 */
export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow"

/** Protocol cap: at most 10,000 URLs per POST. Larger sets are chunked. */
export const INDEXNOW_MAX_URLS_PER_REQUEST = 10_000

/** Default per-request timeout, so a hung endpoint can't stall the caller. */
const DEFAULT_TIMEOUT_MS = 10_000

/** The JSON body IndexNow expects for a multi-URL submission. */
export interface IndexNowPayload {
	host: string
	key: string
	keyLocation: string
	urlList: string[]
}

/** Outcome of one batch POST — the raw status plus IndexNow's short body. */
export interface IndexNowBatchResult {
	/** HTTP status, or `0` when the request never completed (network/timeout). */
	status: number
	/** True for 200/202 — IndexNow's two success codes. */
	ok: boolean
	/** IndexNow's response text (or the thrown error's message), for surfacing. */
	message: string
	/**
	 * Error class name (`TimeoutError`, `TypeError`, …) when the request never
	 * completed, else `null`. `message` alone is runtime-dependent prose, so this
	 * is what distinguishes "the timeout was too short" from "the network is down".
	 */
	errorName: string | null
	/** How many URLs this batch carried, for the result summary. */
	count: number
}

/**
 * Aggregate result across every batch. `ok` is true only if all batches were.
 *
 * `attempted` and `accepted` are deliberately separate: a run where every batch
 * 403s still *attempted* every URL, and reporting that number as though the URLs
 * landed is how an operator ends up believing a failed submission succeeded.
 */
export interface IndexNowResult {
	ok: boolean
	/** URLs sent, across all batches — including batches that were rejected. */
	attempted: number
	/** URLs carried by batches IndexNow accepted (200/202). */
	accepted: number
	batches: IndexNowBatchResult[]
}

export interface SubmitOptions {
	key: string
	/** Full URL of the served key file, e.g. `https://host/indexnow-key.txt`. */
	keyLocation: string
	/** Bare host (no scheme), e.g. `roland.leth.ro`. */
	host: string
	urls: string[]
	/** Overridable for tests; defaults to the vendor-neutral endpoint. */
	endpoint?: string
	/** Injectable for tests; defaults to the global `fetch`. */
	fetchImpl?: typeof fetch
	timeoutMs?: number
	/**
	 * Overridable for tests; defaults to the protocol cap. Without this the
	 * multi-batch loop is only reachable with a 10,001-element array, so the
	 * batching this module exists to do would go untested.
	 */
	batchSize?: number
}

/**
 * True when `origin` is safe to announce to IndexNow: an absolute `https` URL on
 * a public host. Blocks a dev/preview click (http, or `localhost`/loopback)
 * from submitting non-public URLs the search engines would reject anyway — the
 * whole reason submission runs in the deploy rather than from a local script.
 */
export function isSubmittableOrigin(origin: string): boolean {
	let url: URL

	try {
		url = new URL(origin)
	} catch {
		return false
	}

	if (url.protocol !== "https:") {
		return false
	}

	const host = url.hostname.toLowerCase()

	// Loopback and `*.localhost` never resolve to a crawlable public page.
	const isLoopback =
		host === "localhost" || host.endsWith(".localhost") || host === "[::1]"

	if (isLoopback) {
		return false
	}

	// An IP literal is never a crawlable site host, and a dot check alone would
	// wave through the whole 127/10/192.168 space. Reject every IPv4 literal and
	// every bracketed IPv6 literal rather than enumerating private ranges.
	const isIpLiteral =
		/^\d{1,3}(\.\d{1,3}){3}$/.test(host) ||
		(host.startsWith("[") && host.endsWith("]"))

	if (isIpLiteral) {
		return false
	}

	// A public host must have a dot (a registrable domain); a bare label is a
	// local/intranet name.
	return host.includes(".")
}

/**
 * URLs whose host differs from `host`. IndexNow rejects an entire batch (422) if
 * any URL is off-host, so the route surfaces these instead of submitting a batch
 * doomed to fail. Malformed URLs count as foreign — they can't be verified.
 */
export function findForeignHostUrls(host: string, urls: string[]): string[] {
	const target = host.toLowerCase()

	return urls.filter((raw) => {
		try {
			return new URL(raw).host.toLowerCase() !== target
		} catch {
			return true
		}
	})
}

/** Splits `urls` into batches no larger than `size`. */
export function chunkUrls(
	urls: string[],
	size = INDEXNOW_MAX_URLS_PER_REQUEST
): string[][] {
	const batches: string[][] = []

	for (let index = 0; index < urls.length; index += size) {
		batches.push(urls.slice(index, index + size))
	}

	return batches
}

export function buildIndexNowPayload(
	host: string,
	key: string,
	keyLocation: string,
	urlList: string[]
): IndexNowPayload {
	return { host, key, keyLocation, urlList }
}

/**
 * Submits `urls` to IndexNow, chunked to the protocol cap. Each batch is POSTed
 * independently and its status recorded — a mid-run failure still reports the
 * batches that landed rather than discarding them. Callers should run
 * `findForeignHostUrls` first; this trusts that every URL is on `host`.
 *
 * An empty `urls` returns `ok: false`: there is nothing to succeed at, and a
 * vacuous `true` (from `[].every()`) would read as a successful submission.
 */
export async function submitToIndexNow(
	options: SubmitOptions
): Promise<IndexNowResult> {
	const {
		key,
		keyLocation,
		host,
		urls,
		endpoint = INDEXNOW_ENDPOINT,
		fetchImpl = fetch,
		timeoutMs = DEFAULT_TIMEOUT_MS,
		batchSize = INDEXNOW_MAX_URLS_PER_REQUEST,
	} = options

	const batches: IndexNowBatchResult[] = []

	for (const batch of chunkUrls(urls, batchSize)) {
		batches.push(
			await submitBatch(fetchImpl, endpoint, timeoutMs, {
				payload: buildIndexNowPayload(host, key, keyLocation, batch),
				count: batch.length,
			})
		)
	}

	const accepted = batches
		.filter((batch) => batch.ok)
		.reduce((total, batch) => total + batch.count, 0)

	return {
		ok: batches.length > 0 && batches.every((batch) => batch.ok),
		attempted: urls.length,
		accepted,
		batches,
	}
}

/** POSTs a single batch, translating any transport error into a `status: 0` result. */
async function submitBatch(
	fetchImpl: typeof fetch,
	endpoint: string,
	timeoutMs: number,
	batch: { payload: IndexNowPayload; count: number }
): Promise<IndexNowBatchResult> {
	try {
		const response = await fetchImpl(endpoint, {
			method: "POST",
			headers: { "Content-Type": "application/json; charset=utf-8" },
			body: JSON.stringify(batch.payload),
			signal: AbortSignal.timeout(timeoutMs),
		})

		// IndexNow returns a short text body; keep it for the panel to surface on a
		// non-2xx (403 = key file unreachable/mismatched, 422 = off-host URLs, etc.).
		const message = (await response.text().catch(() => "")).trim()

		return {
			status: response.status,
			ok: response.status === 200 || response.status === 202,
			message,
			errorName: null,
			count: batch.count,
		}
	} catch (error) {
		return {
			status: 0,
			ok: false,
			message: error instanceof Error ? error.message : "request failed",
			errorName: error instanceof Error ? error.name : "UnknownError",
			count: batch.count,
		}
	}
}
