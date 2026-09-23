import { describe, expect, it, vi } from "vitest"
import {
	runUploadPrune,
	type UploadPruneOptions,
} from "@/lib/import/uploadPruneRun"
import type { ListedBlob } from "@/lib/import/blobSync"

const NOW = new Date("2026-09-16T12:00:00.000Z")
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")
const STORE_HOST = "abc123.public.blob.vercel-storage.com"
const DATABASE_TARGET = "app_user@db.example.com:5432/site"

const ID_KEPT = "0f8e4b1c-2d3a-4e5f-8a9b-0c1d2e3f4a5b"
const ID_ORPHAN = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d"
const ID_FRESH = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"
const ID_ORPHAN_2 = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e"

function upload(pathname: string, uploadedAt: Date = LONG_AGO): ListedBlob {
	return {
		pathname,
		url: `https://${STORE_HOST}/${pathname}`,
		size: 1024,
		uploadedAt,
	}
}

const KEPT = upload(`${ID_KEPT}-kept.png`)
const ORPHAN = upload(`${ID_ORPHAN}-orphan.png`)
const FRESH = upload(`${ID_FRESH}-fresh.png`, NOW)

/** A row that references `KEPT`, the way a post's image column does. */
const ROWS = [{ imageUrl: KEPT.url }]

/**
 * A fake store and database around `blobs` and `rows`, with every side effect
 * recorded, so each test can assert what was deleted and in what order.
 */
function setup(blobs: ListedBlob[], rows: readonly object[] = ROWS) {
	const store = {
		list: vi.fn(async () => ({ blobs, hasMore: false })),
		del: vi.fn(async (_urls: string[]) => {}),
	}
	const log = vi.fn()
	const error = vi.fn()
	const deps = { store, readRows: vi.fn(async () => rows), log, error }

	function run(overrides: Partial<UploadPruneOptions> = {}) {
		return runUploadPrune(deps, {
			isApply: false,
			now: NOW,
			databaseTarget: DATABASE_TARGET,
			...overrides,
		})
	}

	return { store, log, error, run }
}

function loggedLines(log: ReturnType<typeof vi.fn>): string[] {
	return log.mock.calls.map(([line]) => String(line))
}

// #region Dry run

describe("runUploadPrune — dry run", () => {
	it("lists what it would delete and deletes nothing", async () => {
		const { store, log, run } = setup([KEPT, ORPHAN, FRESH])

		const outcome = await run()

		expect(outcome).toBe("dry-run")
		expect(store.del).not.toHaveBeenCalled()
		expect(
			loggedLines(log).some((line) => line.includes(ORPHAN.pathname))
		).toBe(true)
	})

	it("reports the refusal too, so a mismatch shows before anyone applies", async () => {
		const { store, error, run } = setup(
			[KEPT, ORPHAN, upload(`${ID_ORPHAN_2}-orphan.png`)],
			ROWS
		)

		const outcome = await run()

		expect(outcome).toBe("refused")
		expect(error).toHaveBeenCalledWith(
			expect.stringContaining("would delete 2 uploads")
		)
		expect(store.del).not.toHaveBeenCalled()
	})
})

// #endregion

// #region Apply

describe("runUploadPrune — apply", () => {
	it("deletes exactly the unreferenced uploads past the grace period", async () => {
		const { store, run } = setup([KEPT, ORPHAN, FRESH])

		const outcome = await run({ isApply: true })

		expect(outcome).toBe("deleted")
		expect(store.del.mock.calls).toEqual([[[ORPHAN.url]]])
	})

	it("refuses before any delete when orphans outnumber referenced uploads", async () => {
		// A database from another environment that shares one image with the
		// store: the zero-referenced check alone let this through.
		const { store, error, run } = setup(
			[KEPT, ORPHAN, upload(`${ID_ORPHAN_2}-orphan.png`)],
			ROWS
		)

		const outcome = await run({ isApply: true })

		expect(outcome).toBe("refused")
		expect(error).toHaveBeenCalledOnce()
		expect(store.del).not.toHaveBeenCalled()
	})

	it("refuses when the database references none of the uploads", async () => {
		const { store, run } = setup([KEPT, ORPHAN], [])

		const outcome = await run({ isApply: true })

		expect(outcome).toBe("refused")
		expect(store.del).not.toHaveBeenCalled()
	})

	it("deletes nothing when every upload is referenced or recent", async () => {
		const { store, log, run } = setup([KEPT, FRESH])

		const outcome = await run({ isApply: true })

		expect(outcome).toBe("nothing-to-delete")
		expect(store.del).not.toHaveBeenCalled()
		expect(loggedLines(log)).toContain("\nNothing to delete.")
	})
})

// #endregion

// #region Targets

describe("runUploadPrune — targets", () => {
	it("prints the database and the blob store before it deletes anything", async () => {
		const { store, log, run } = setup([KEPT, ORPHAN])

		await run({ isApply: true })

		const lines = loggedLines(log)
		const databaseLine = lines.findIndex((line) =>
			line.includes(DATABASE_TARGET)
		)
		const storeLine = lines.findIndex((line) => line.includes(STORE_HOST))

		expect(databaseLine).toBeGreaterThan(-1)
		expect(storeLine).toBeGreaterThan(-1)
		// Both lines were logged before the first delete call.
		const firstDelete = store.del.mock.invocationCallOrder[0]
		expect(log.mock.invocationCallOrder[databaseLine]).toBeLessThan(firstDelete)
		expect(log.mock.invocationCallOrder[storeLine]).toBeLessThan(firstDelete)
	})

	it("says so when the store is empty", async () => {
		const { log, run } = setup([])

		await run()

		expect(loggedLines(log)).toContain("  blob store: (empty store)")
	})
})

// #endregion
