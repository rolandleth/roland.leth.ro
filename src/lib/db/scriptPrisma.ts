// The Prisma client for the CLIs under `scripts/`, which run outside the app.
//
// Not `db.ts`. The app client resolves its URL through `getDatabaseUrl`, which
// validates the whole app env schema, so a malformed variable a script never
// reads — a bad `INDEXNOW_KEY`, a non-hex `ADMIN_HASH_PASSWORD` in a pulled env —
// would stop the script connecting. A script needs `DATABASE_URL` and nothing
// else. It also has no use for `db.ts`'s `globalThis` cache, which exists for
// dev-server hot reloads.

import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@/generated/prisma/client"

/**
 * A client on `DATABASE_URL`, or an error saying how to provide it when it's
 * unset or blank — the usual first-run mistake, since scripts target production
 * through pulled credentials. The caller owns the client and calls
 * `$disconnect()` when done.
 */
export function makeScriptPrisma(): PrismaClient {
	const connectionString = process.env.DATABASE_URL

	if (connectionString == null || connectionString === "") {
		throw new Error(
			"DATABASE_URL is not set. Provide DB credentials first (e.g. `vercel env pull`)."
		)
	}

	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}
