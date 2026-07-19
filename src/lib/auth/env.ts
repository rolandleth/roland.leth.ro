import { z } from "zod"

/**
 * Single source of truth for every env var the app reads. Each accessor parses
 * `process.env` lazily on call, so tests can stub via `vi.stubEnv` and
 * `delete process.env.X` without re-importing the module.
 *
 * Required-var accessors (`getDatabaseUrl`, `getSessionSecret`) throw an
 * `EnvConfigError` with a predictable message and `code: "ENV_MISSING"` so
 * route handlers can distinguish a misconfigured deploy from other runtime
 * errors. Optional-var accessors return `null` so callers can choose between
 * graceful degradation (Redis-less rate limiting, no cron auth) and a 500.
 *
 * Format checks live in the schema where they're enforceable: `ADMIN_HASH_PASSWORD`
 * is hex-decoded by `verifyCredentials`, so reject non-hex input early rather
 * than producing garbage bytes deep inside `Buffer.from(..., "hex")`. Empty
 * string is still allowed so the `nonEmpty`/required path can produce a useful
 * "not set" message instead of a Zod regex error.
 */
const envSchema = z.object({
	DATABASE_URL: z.string().optional(),
	SESSION_SECRET: z.string().optional(),
	ADMIN_EMAIL: z.string().optional(),
	// Even-length hex only: `Buffer.from(odd, "hex")` silently drops the last
	// nibble, which would let `verifyCredentials` compare bcrypt against a
	// truncated hash. Empty string is still allowed so the `nonEmpty` path can
	// produce a "not set" error instead of a Zod regex failure.
	ADMIN_HASH_PASSWORD: z
		.string()
		.regex(/^([0-9a-f]{2})*$/i, "must be even-length hex")
		.optional(),
	CRON_SECRET: z.string().optional(),
	KV_REST_API_TOKEN: z.string().optional(),
	KV_REST_API_URL: z.string().optional(),
	IP_HASH_SECRET: z.string().optional(),
	// Canonical site origin, resolved without request headers so pages that need
	// it can be statically prerendered. `NEXT_PUBLIC_SITE_URL` is the explicit
	// override (full origin incl. scheme); `VERCEL_PROJECT_PRODUCTION_URL` is
	// Vercel's platform-provided production domain (bare host, always https).
	NEXT_PUBLIC_SITE_URL: z.string().optional(),
	VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
	// IndexNow verification key. The protocol allows 8–128 chars from
	// `[a-zA-Z0-9-]`; reject anything else early so a mistyped value fails here
	// with a clear message instead of a 403 from the search engine at submit time.
	// Empty string is still allowed so the optional accessor can return `null`.
	INDEXNOW_KEY: z
		.string()
		.regex(/^[a-zA-Z0-9-]{8,128}$/, "must be 8–128 chars of [a-zA-Z0-9-]")
		.or(z.literal(""))
		.optional(),
})

type Env = z.infer<typeof envSchema>

/**
 * Thrown when a required env var is missing or fails schema validation.
 * Carries `code: "ENV_MISSING"` and the var name so callers (middleware,
 * route handlers) can branch on misconfiguration vs. business errors.
 */
export class EnvConfigError extends Error {
	readonly code = "ENV_MISSING"

	constructor(
		public readonly varName: string,
		message?: string
	) {
		super(message ?? `${varName} environment variable is not set`)
		this.name = "EnvConfigError"
	}
}

function readEnv(): Env {
	const result = envSchema.safeParse(process.env)

	// Surfaces every schema issue at once (e.g. a non-hex `SESSION_SECRET`)
	// rather than failing mid-call deep in a consumer.
	if (!result.success) {
		const firstIssue = result.error.issues[0]
		const issues = result.error.issues
			.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
			.join("; ")
		throw new EnvConfigError(
			String(firstIssue?.path[0] ?? "ENV"),
			`Invalid env config — ${issues}`
		)
	}

	return result.data
}

function nonEmpty(value: string | undefined): string | null {
	return value != null && value.length > 0 ? value : null
}

function readRequired(name: keyof Env): string {
	const value = nonEmpty(readEnv()[name])

	if (value === null) {
		throw new EnvConfigError(name)
	}

	return value
}

/** PostgreSQL connection string. Required at module load by `db.ts`. */
export function getDatabaseUrl(): string {
	return readRequired("DATABASE_URL")
}

/** JWT signing secret. Required by every protected request. */
export function getSessionSecret(): string {
	return readRequired("SESSION_SECRET")
}

/**
 * Returns the configured admin credentials, or `null` if either var is missing.
 * `verifyCredentials` returns `false` on null so login fails cleanly without a
 * 500 — useful in dev/test where the deployer hasn't set them up.
 */
export function getAdminCredentials(): {
	email: string
	passwordHash: string
} | null {
	const env = readEnv()
	const email = nonEmpty(env.ADMIN_EMAIL)
	const passwordHash = nonEmpty(env.ADMIN_HASH_PASSWORD)

	if (email === null || passwordHash === null) {
		return null
	}

	return { email, passwordHash }
}

/** Cron route bearer token. `null` means no cron auth is configured. */
export function getCronSecret(): string | null {
	return nonEmpty(readEnv().CRON_SECRET)
}

/**
 * Canonical site origin — scheme + host, no trailing slash — resolved from env
 * rather than request headers, so callers (metadata, JSON-LD, sitemap, robots,
 * feed) stay static-prerenderable instead of being forced dynamic by `headers()`.
 *
 * Resolution order:
 *   1. `NEXT_PUBLIC_SITE_URL` — explicit override (full origin incl. scheme);
 *      also the local-dev value and the only one readable in client bundles.
 *   2. `VERCEL_PROJECT_PRODUCTION_URL` — Vercel's production domain (bare host,
 *      always https), identical on preview + prod, so canonical/OG URLs point
 *      at production even from preview deploys.
 *   3. Throw — a build with neither signal fails loudly rather than emitting a
 *      wrong canonical origin.
 */
export function getSiteUrl(): string {
	const env = readEnv()

	const explicit = nonEmpty(env.NEXT_PUBLIC_SITE_URL)

	if (explicit !== null) {
		// `new URL(...).origin` normalizes (strips path/trailing slash) and rejects
		// a value with no scheme, so a malformed override fails loudly right here.
		try {
			return new URL(explicit).origin
		} catch {
			throw new EnvConfigError(
				"NEXT_PUBLIC_SITE_URL",
				`NEXT_PUBLIC_SITE_URL is not a valid absolute URL: ${JSON.stringify(explicit)}`
			)
		}
	}

	const vercelHost = nonEmpty(env.VERCEL_PROJECT_PRODUCTION_URL)

	if (vercelHost !== null) {
		return `https://${vercelHost}`
	}

	throw new EnvConfigError(
		"NEXT_PUBLIC_SITE_URL",
		"Site origin unresolved: set NEXT_PUBLIC_SITE_URL, or deploy on Vercel (which provides VERCEL_PROJECT_PRODUCTION_URL)."
	)
}

/**
 * HMAC secret used to pseudonymize client IPs before they're written to the
 * rate-limit bucket key. `null` means no secret is configured — the login
 * route then keeps rate-limiting on but falls back to a single global bucket
 * (coarser, no per-IP keying) rather than write plain-IP keys (GDPR posture
 * regression). It never disables the limiter on the secret alone.
 */
export function getIpHashSecret(): string | null {
	return nonEmpty(readEnv().IP_HASH_SECRET)
}

/**
 * IndexNow verification key, or `null` when unset. Served verbatim at
 * `/indexnow-key.txt` and sent as the `key` in submissions. `null` lets the
 * key route return 404 and the admin submit route reject with a clear message,
 * rather than a deploy without the key 500-ing.
 */
export function getIndexNowKey(): string | null {
	return nonEmpty(readEnv().INDEXNOW_KEY)
}

/**
 * Returns the Upstash Redis config when both vars are present, or `null` to
 * signal "no Redis available" (login route falls back to no rate-limiting,
 * cron returns 200 without a ping). Both vars are required because
 * `Redis.fromEnv()` throws at module load if either is missing.
 */
export function getRedisConfig(): { token: string; url: string } | null {
	const env = readEnv()
	const token = nonEmpty(env.KV_REST_API_TOKEN)
	const url = nonEmpty(env.KV_REST_API_URL)

	if (token === null || url === null) {
		return null
	}

	return { token, url }
}
