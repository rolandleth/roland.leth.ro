import { describe, expect, it } from "vitest"
import { adminUploadKey } from "@/app/api/admin/upload/uploadHelpers"
import {
	collectReferencedUploadIds,
	isAdminUploadKey,
	planUploadPrune,
	reasonToRefuseApply,
	UPLOAD_GRACE_PERIOD_HOURS,
	type UploadPrunePlan,
} from "@/lib/import/uploadPrune"
import type { ListedBlob } from "@/lib/import/blobSync"

const NOW = new Date("2026-09-16T12:00:00.000Z")
const HOUR = 60 * 60 * 1000
const LONG_AGO = new Date("2026-01-01T00:00:00.000Z")

const ID_A = "0f8e4b1c-2d3a-4e5f-8a9b-0c1d2e3f4a5b"
const ID_B = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d"

function upload(
	pathname: string,
	uploadedAt: Date = LONG_AGO,
	size = 1024
): ListedBlob {
	return {
		pathname,
		url: `https://store.public.blob.vercel-storage.com/${pathname}`,
		size,
		uploadedAt,
	}
}

function emptyPlan(): UploadPrunePlan {
	return { referenced: [], recent: [], unreferenced: [] }
}

// #region isAdminUploadKey

describe("isAdminUploadKey", () => {
	it.each(["cover.png", "My photo (1).PNG", "   ", "résumé draft.jpeg"])(
		"recognizes a key the upload route actually writes, for %j",
		(filename) => {
			// Fed through the route's own key builder, so a change to the key shape
			// fails here instead of leaving the sweep blind to new uploads.
			expect(isAdminUploadKey(adminUploadKey(filename))).toBe(true)
		}
	)

	it("recognizes a key an older SDK wrote with a random suffix", () => {
		expect(isAdminUploadKey(`${ID_A}-cover-Xk3Pq9.png`)).toBe(true)
	})

	it.each([
		["the project importer's keys", `projects/reckon/${ID_A}.png`],
		["a file at the root with no UUID", "favicon.png"],
		["a UUID that isn't at the start", `copy-${ID_A}-cover.png`],
		["a key nested under the UUID", `${ID_A}-folder/cover.png`],
		["a bare UUID with no hyphen after it", ID_A],
		[
			"an uppercase UUID, which randomUUID never writes",
			`${ID_A.toUpperCase()}-a.png`,
		],
	])("leaves out %s", (_label, pathname) => {
		expect(isAdminUploadKey(pathname)).toBe(false)
	})
})

// #endregion

// #region collectReferencedUploadIds

describe("collectReferencedUploadIds", () => {
	it("finds an upload in a column holding its URL", () => {
		const ids = collectReferencedUploadIds([
			{
				id: 1,
				imageUrl: `https://store.public.blob.vercel-storage.com/${ID_A}-cover.png`,
			},
		])

		expect(ids).toEqual(new Set([ID_A]))
	})

	it("finds an upload pasted into a markdown body, full stop and all", () => {
		// A URL parser would read the trailing full stop as part of the name and
		// miss the reference, and a missed reference is a deleted live image.
		const body = `Intro.\n\n![Cover](https://store.public.blob.vercel-storage.com/${ID_A}-cover.png)\n\nSee https://store.public.blob.vercel-storage.com/${ID_B}-chart.png.`

		expect(collectReferencedUploadIds([{ body }])).toEqual(
			new Set([ID_A, ID_B])
		)
	})

	it("finds an upload behind a custom domain or with a query string", () => {
		const ids = collectReferencedUploadIds([
			{ icon: `https://img.example.com/${ID_A}-icon.png?v=2` },
		])

		expect(ids.has(ID_A)).toBe(true)
	})

	it("lowercases what it finds, since keys are lowercase", () => {
		const ids = collectReferencedUploadIds([{ note: ID_A.toUpperCase() }])

		expect(ids).toEqual(new Set([ID_A]))
	})

	it("walks nested arrays and objects, so JSON columns count", () => {
		const ids = collectReferencedUploadIds([
			{
				offers: [{ name: "Pro", image: { url: `https://s/${ID_B}-pro.png` } }],
			},
		])

		expect(ids).toEqual(new Set([ID_B]))
	})

	it("ignores values that carry no text", () => {
		const ids = collectReferencedUploadIds([
			{
				id: 7,
				published: true,
				publishedAt: NOW,
				imageUrl: null,
				readingTime: undefined,
			},
		])

		expect(ids.size).toBe(0)
	})
})

// #endregion

// #region planUploadPrune

describe("planUploadPrune", () => {
	it("keeps a referenced upload however old it is", () => {
		const blob = upload(`${ID_A}-cover.png`, LONG_AGO)

		const plan = planUploadPrune([blob], new Set([ID_A]), NOW)

		expect(plan).toEqual({ ...emptyPlan(), referenced: [blob] })
	})

	it("keeps a referenced upload that is also recent as referenced", () => {
		const blob = upload(`${ID_A}-cover.png`, new Date(NOW.getTime() - HOUR))

		const plan = planUploadPrune([blob], new Set([ID_A]), NOW)

		expect(plan.referenced).toEqual([blob])
		expect(plan.recent).toEqual([])
	})

	it("keeps an unreferenced upload inside the grace period, which may sit in an unsaved form", () => {
		const blob = upload(`${ID_A}-cover.png`, new Date(NOW.getTime() - HOUR))

		const plan = planUploadPrune([blob], new Set(), NOW)

		expect(plan).toEqual({ ...emptyPlan(), recent: [blob] })
	})

	it("marks an unreferenced upload past the grace period for deletion", () => {
		const blob = upload(`${ID_A}-cover.png`, LONG_AGO)

		const plan = planUploadPrune([blob], new Set([ID_B]), NOW)

		expect(plan).toEqual({ ...emptyPlan(), unreferenced: [blob] })
	})

	it("treats exactly the grace period as expired and a millisecond less as recent", () => {
		const graceMs = UPLOAD_GRACE_PERIOD_HOURS * HOUR
		const expired = upload(`${ID_A}-a.png`, new Date(NOW.getTime() - graceMs))
		const recent = upload(
			`${ID_B}-b.png`,
			new Date(NOW.getTime() - graceMs + 1)
		)

		const plan = planUploadPrune([expired, recent], new Set(), NOW)

		expect(plan.unreferenced).toEqual([expired])
		expect(plan.recent).toEqual([recent])
	})

	it("leaves every blob that isn't an admin upload out of all three buckets", () => {
		// The project importer prunes `projects/<slug>/` itself, and anything added
		// by hand isn't this sweep's to judge.
		const plan = planUploadPrune(
			[upload(`projects/reckon/${ID_A}.png`), upload("favicon.png")],
			new Set(),
			NOW
		)

		expect(plan).toEqual(emptyPlan())
	})
})

// #endregion

// #region reasonToRefuseApply

describe("reasonToRefuseApply", () => {
	it("allows a plan with nothing to delete", () => {
		expect(reasonToRefuseApply(emptyPlan())).toBeNull()
	})

	it("allows deleting orphans when the database references other uploads", () => {
		const plan: UploadPrunePlan = {
			...emptyPlan(),
			referenced: [upload(`${ID_A}-kept.png`)],
			unreferenced: [upload(`${ID_B}-orphan.png`)],
		}

		expect(reasonToRefuseApply(plan)).toBeNull()
	})

	it("refuses when the database references none of the store's uploads", () => {
		// A local or empty DATABASE_URL with the production blob token: every upload
		// looks orphaned, and applying would delete every image on the site.
		const plan: UploadPrunePlan = {
			...emptyPlan(),
			unreferenced: [upload(`${ID_A}-a.png`), upload(`${ID_B}-b.png`)],
		}

		const reason = reasonToRefuseApply(plan)

		expect(reason).toContain("DATABASE_URL")
		expect(reason).toContain("BLOB_READ_WRITE_TOKEN")
		expect(reason).toContain("2 uploads")
	})

	it("allows a plan whose only unreferenced uploads are still recent", () => {
		// Nothing would be deleted, so there is nothing to guard.
		const plan: UploadPrunePlan = {
			...emptyPlan(),
			recent: [upload(`${ID_A}-a.png`, NOW)],
		}

		expect(reasonToRefuseApply(plan)).toBeNull()
	})
})

// #endregion
