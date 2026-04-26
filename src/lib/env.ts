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
	ADMIN_HASH_PASSWORD: z
		.string()
		.regex(/^[0-9a-f]*$/i, "must be hex-encoded")
		.optional(),
	CRON_SECRET: z.string().optional(),
	KV_REST_API_TOKEN: z.string().optional(),
	KV_REST_API_URL: z.string().optional(),
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
