import { beforeEach, describe, expect, it, vi } from "vitest"
import { auditLog } from "@/lib/auditLog"

beforeEach(() => {
	vi.resetAllMocks()
})

describe("auditLog", () => {
	it("emits a fixed-shape payload with explicit nulls for absent keys", async () => {
		// Without the normalization, a log aggregator parser would have to
		// handle six different per-handler shapes (posts POST has `section`
		// only, projects POST has `sortOrder` only, etc.); the normalized shape
		// lets one parser cover every admin write.
		auditLog("[api:admin:posts:POST]", {
			id: 7,
			slug: "hello",
			section: "tech",
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
			}
		)
	})

	it("preserves caller-provided null values (no overwrite to undefined)", async () => {
		// PUT handlers pass `previousSlug` as a literal null when the column
		// didn't change; the helper must not collapse that to `undefined` or
		// the parser sees a different shape for "no change" vs "renamed".
		auditLog("[api:admin:projects:PUT]", {
			id: 1,
			slug: "x",
			previousSlug: null,
		})

		expect(vi.mocked(console.info)).toHaveBeenCalledWith(
			"[api:admin:projects:PUT] success",
			expect.objectContaining({ previousSlug: null })
		)
	})

	it("emits the tag followed by 'success' so log greps can pin both segments", async () => {
		auditLog("[api:admin:posts:DELETE]", { id: 2 })

		const calls = vi.mocked(console.info).mock.calls
		expect(calls[0][0]).toBe("[api:admin:posts:DELETE] success")
	})
})
