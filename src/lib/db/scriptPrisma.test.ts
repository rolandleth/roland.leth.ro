import { PrismaPg } from "@prisma/adapter-pg"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { PrismaClient } from "@/generated/prisma/client"
import { makeScriptPrisma } from "@/lib/db/scriptPrisma"

// `function`, not arrow, implementations: the helper calls both with `new`, and
// Vitest only constructs a mock whose implementation is constructible.
vi.mock("@prisma/adapter-pg", () => ({
	PrismaPg: vi.fn(function PrismaPg() {}),
}))

vi.mock("@/generated/prisma/client", () => ({
	PrismaClient: vi.fn(function PrismaClient() {}),
}))

const URL = "postgres://user:secret@db.example.com:5432/site"

// `restoreMocks` in the config doesn't clear a `vi.fn`'s call history, so a
// client built by one test would count against the next one's "never built".
beforeEach(() => {
	vi.clearAllMocks()
})

describe("makeScriptPrisma", () => {
	it("connects the adapter to DATABASE_URL and hands it to the client", () => {
		vi.stubEnv("DATABASE_URL", URL)

		makeScriptPrisma()

		expect(vi.mocked(PrismaPg).mock.calls).toEqual([
			[{ connectionString: URL }],
		])
		expect(vi.mocked(PrismaClient).mock.calls).toEqual([
			[{ adapter: expect.any(PrismaPg) }],
		])
	})

	it.each([
		["unset", undefined],
		["blank", ""],
	])("says how to provide DATABASE_URL when it's %s", (_label, value) => {
		vi.stubEnv("DATABASE_URL", value)

		expect(() => makeScriptPrisma()).toThrow(
			/DATABASE_URL is not set.*vercel env pull/
		)
		expect(PrismaClient).not.toHaveBeenCalled()
	})

	it("ignores app env a script never reads, even when it's malformed", () => {
		// The reason this isn't `db.ts`: the app client validates its whole env
		// schema, so a bad variable unrelated to the database would stop a script.
		vi.stubEnv("DATABASE_URL", URL)
		vi.stubEnv("ADMIN_HASH_PASSWORD", "not hex at all")
		vi.stubEnv("INDEXNOW_KEY", "!")

		expect(() => makeScriptPrisma()).not.toThrow()
	})
})
