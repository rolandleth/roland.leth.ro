import { beforeEach, describe, expect, it, vi } from "vitest"
import { auditLog, type AdminAuditPayload } from "@/lib/auditLog"

beforeEach(() => {
	vi.resetAllMocks()
})

describe("auditLog", () => {
	it("emits the full fixed-shape payload exactly as passed", async () => {
		auditLog("[api:admin:posts:POST]", {
			id: 7,
			slug: "hello",
			section: "tech",
			sortOrder: null,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:POST] success",
			{
				id: 7,
				slug: "hello",
				section: "tech",
				sortOrder: null,
				previousSection: null,
				previousSlug: null,
				batchId: null,
			}
		)
	})

	it("preserves caller-provided null values verbatim", async () => {
		// PUT handlers pass `previousSlug` as null when the column didn't change;
		// the helper must not transform that to `undefined` or the aggregator
		// parser sees a different shape for "no change" vs "renamed".
		auditLog("[api:admin:projects:PUT]", {
			id: 1,
			slug: "x",
			section: null,
			sortOrder: 0,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:PUT] success",
			expect.objectContaining({ previousSlug: null, sortOrder: 0 })
		)
	})

	it("emits the tag followed by 'success' so log greps can pin both segments", async () => {
		auditLog("[api:admin:posts:DELETE]", {
			id: 2,
			slug: "x",
			section: "tech",
			sortOrder: null,
			previousSection: null,
			previousSlug: null,
			batchId: null,
		})

		const calls = vi.mocked(console.info).mock.calls
		expect(calls[0][0]).toBe("[api:admin:posts:DELETE] success")
	})

	it("includes a non-null batchId for bulk surfaces so a run can be greppable as one unit", () => {
		auditLog("[api:admin:posts:BULK]", {
			id: 9,
			slug: "x",
			section: "tech",
			sortOrder: null,
			previousSection: null,
			previousSlug: null,
			batchId: "00000000-0000-0000-0000-000000000000",
		})

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:posts:BULK] success",
			expect.objectContaining({
				batchId: "00000000-0000-0000-0000-000000000000",
			})
		)
	})

	it("requires every field at the type level so call sites can't silently drop a relevant change", () => {
		// Type-level regression guard: `AdminAuditPayload` keys are required, so
		// a future caller dropping (e.g.) `previousSlug` on a slug rename surfaces
		// at tsc instead of emitting `null` for a change the handler did make.
		// @ts-expect-error — `previousSlug` missing
		const incomplete: AdminAuditPayload = {
			id: 1,
			slug: "x",
			section: null,
			sortOrder: null,
			previousSection: null,
			batchId: null,
		}

		expect(incomplete).toBeDefined()
	})
})
