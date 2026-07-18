import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { applySlugRewrites } from "./applySlugRewrites"
import type { ParsedPostFile } from "./postImport"

// A parsed file carrying a pending rewrite; only the fields the writer reads.
function parsedWithRewrite(
	filename: string,
	slug: string,
	content: string,
	previous: string | null
): ParsedPostFile {
	return {
		filename,
		title: "T",
		slug,
		datetime: "2026-07-24-0937",
		body: "Body.",
		slugRewrite: { content, previous },
	}
}

describe("applySlugRewrites", () => {
	let folder: string

	beforeEach(async () => {
		folder = await mkdtemp(path.join(tmpdir(), "rlr-rewrites-"))
	})

	afterEach(async () => {
		await rm(folder, { recursive: true, force: true })
	})

	it("describes but does not write on a dry run", async () => {
		const filename = "2026-07-24-0937-a.md"
		await writeFile(path.join(folder, filename), "original", "utf8")
		const parsed = [parsedWithRewrite(filename, "a", "rewritten", null)]

		const outcomes = await applySlugRewrites(folder, parsed, true)

		expect(outcomes).toEqual([
			{ filename, change: "slug: a (from title)", result: "planned" },
		])
		expect(await readFile(path.join(folder, filename), "utf8")).toBe("original")
	})

	it("writes the rewritten content and leaves no temp file behind", async () => {
		const filename = "2026-07-24-0937-a.md"
		await writeFile(path.join(folder, filename), "original", "utf8")
		const parsed = [parsedWithRewrite(filename, "a", "rewritten", "old")]

		const outcomes = await applySlugRewrites(folder, parsed, false)

		expect(outcomes).toEqual([
			{ filename, change: 'slug: "old" → a', result: "written" },
		])
		expect(await readFile(path.join(folder, filename), "utf8")).toBe(
			"rewritten"
		)
		expect(await readdir(folder)).toEqual([filename])
	})

	// A blank prior value (`""`) is a real previous slug, distinct from `null`
	// ("derived from title"), so the log must read `slug: "" → x`, not "(from title)".
	it("distinguishes a blank previous slug from a title-derived one", async () => {
		const filename = "2026-07-24-0937-a.md"
		await writeFile(path.join(folder, filename), "original", "utf8")
		const parsed = [parsedWithRewrite(filename, "a", "rewritten", "")]

		const outcomes = await applySlugRewrites(folder, parsed, false)

		expect(outcomes).toEqual([
			{ filename, change: 'slug: "" → a', result: "written" },
		])
	})

	it("skips files with no pending rewrite", async () => {
		const parsed: ParsedPostFile[] = [
			{
				filename: "2026-07-24-0937-a.md",
				title: "T",
				slug: "a",
				datetime: "2026-07-24-0937",
				body: "Body.",
				slugRewrite: null,
			},
		]

		expect(await applySlugRewrites(folder, parsed, false)).toEqual([])
	})

	// One file's failure must not abort the batch: the second file still writes.
	it("captures a per-file write failure and keeps going", async () => {
		const okName = "2026-07-24-0937-ok.md"
		const failName = "2026-07-24-0937-fail.md"
		await writeFile(path.join(folder, okName), "original", "utf8")
		// A non-empty directory at the target path makes the rename over it fail.
		await mkdir(path.join(folder, failName))
		await writeFile(path.join(folder, failName, "keep"), "x", "utf8")

		const parsed = [
			parsedWithRewrite(failName, "fail", "rewritten", null),
			parsedWithRewrite(okName, "ok", "rewritten", null),
		]

		const outcomes = await applySlugRewrites(folder, parsed, false)

		expect(outcomes[0]?.result).toBe("failed")
		expect(outcomes[0]?.error).toBeTruthy()
		expect(outcomes[1]?.result).toBe("written")
		expect(await readFile(path.join(folder, okName), "utf8")).toBe("rewritten")
		// The failed write left no stray temp sibling next to the directory.
		expect(
			(await readdir(folder)).filter((name) => name.includes(".tmp"))
		).toEqual([])
	})
})
