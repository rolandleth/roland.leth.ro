// Credentials for the CLIs under `scripts/`. Each script loads `.env` through
// `dotenv/config`, never `.env.local`, which is where a bare `vercel env pull`
// writes, and a bare pull takes the Development values anyway. Every "not set"
// message names the file the scripts read and the command that fills it.

/** Where a script's credentials come from, appended to every "not set" message. */
export const SCRIPT_CREDENTIALS_HINT =
	"Scripts read `.env`; put production credentials there (`vercel env pull .env --environment=production`)."

/**
 * An env var's trimmed value, or `null` when it's unset or blank.
 *
 * Blank counts as unset. A check for `undefined` alone let `""` through, so the
 * script went on and failed later, inside the SDK that needed the value.
 */
export function readScriptEnv(name: string): string | null {
	const value = process.env[name]?.trim()

	return value == null || value === "" ? null : value
}

/**
 * Which database a connection string points at, as `user@host:port/database`,
 * without the password or the query string. A script prints it before it acts,
 * so the operator can see the target.
 *
 * The user is kept because the host alone doesn't say which database it is:
 * Prisma Postgres serves every database from the same host, and the user names
 * the database. `null` when the value isn't a URL.
 */
export function describeDatabaseUrl(connectionString: string): string | null {
	const url = URL.parse(connectionString)

	if (url == null || url.host === "") {
		return null
	}

	const user = url.username === "" ? "" : `${url.username}@`
	const database = url.pathname === "/" ? "" : url.pathname

	return `${user}${url.host}${database}`
}
