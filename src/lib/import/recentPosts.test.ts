import { describe, expect, it } from "vitest"
import { buildPostFile, setFrontmatterSlug } from "./frontmatter"
import {
	DEFAULT_RECENT_POST_COUNT,
	parseRecentPostFiles,
	resolveLastArg,
} from "./recentPosts"
import type { ImportFile } from "./postImport"

/** A well-formed post file whose slug is its own filename, so each is unique. */
function postFile(filename: string, slug = filename.replace(/\.md$/, "")) {
	return {
		filename,
		content: setFrontmatterSlug(buildPostFile("A title", "Body text"), slug),
	} satisfies ImportFile
}

function parsedNames(files: ImportFile[], count: number): string[] {
	return parseRecentPostFiles(files, count).parsed.map((file) => file.filename)
}

// #region resolveLastArg

describe("resolveLastArg", () => {
	it("takes the default when the flag is absent", () => {
		expect(DEFAULT_RECENT_POST_COUNT).toBe(10)
		expect(resolveLastArg(undefined)).toEqual({ count: 10 })
	})

	it("takes 0 as every file", () => {
		expect(resolveLastArg("0")).toEqual({ count: 0 })
	})

	it("takes a whole number", () => {
		expect(resolveLastArg("25")).toEqual({ count: 25 })
	})

	it.each(["", "abc", "-1", "1.5", "+3", " 5", "1e3", "5x"])(
		"refuses %j rather than guessing",
		(value) => {
			expect(resolveLastArg(value)).toEqual({
				problem: `"${value}" is not a valid --last. Use --last=<last> with a whole number of 0 or more; 0 imports every file.`,
			})
		}
	)
})

// #endregion

// #region parseRecentPostFiles

describe("parseRecentPostFiles", () => {
	it("keeps every file when the count is 0", () => {
		const files = [
			postFile("2026-01-01-a.md"),
			postFile("2026-02-01-b.md"),
			postFile("2026-03-01-c.md"),
		]

		expect(parseRecentPostFiles(files, 0)).toMatchObject({
			skipped: [],
			leftOut: 0,
		})
		expect(parsedNames(files, 0)).toEqual([
			"2026-01-01-a.md",
			"2026-02-01-b.md",
			"2026-03-01-c.md",
		])
	})

	it("keeps the newest files and counts the rest as left out", () => {
		const files = [
			postFile("2026-01-01-a.md"),
			postFile("2026-02-01-b.md"),
			postFile("2026-03-01-c.md"),
		]

		expect(parsedNames(files, 2)).toEqual([
			"2026-02-01-b.md",
			"2026-03-01-c.md",
		])
		expect(parseRecentPostFiles(files, 2).leftOut).toBe(1)
	})

	it("keeps every file when the count exceeds the folder", () => {
		const files = [postFile("2026-01-01-a.md"), postFile("2026-02-01-b.md")]

		expect(parsedNames(files, 10)).toEqual([
			"2026-01-01-a.md",
			"2026-02-01-b.md",
		])
		expect(parseRecentPostFiles(files, 10).leftOut).toBe(0)
	})

	it("goes by the filename's datetime, not its name order", () => {
		// By name, `Title` sorts after `0930`, but it carries 00:00.
		const files = [
			postFile("2026-01-05-0930-timed.md"),
			postFile("2026-01-05-Untimed.md"),
		]

		expect(parsedNames(files, 1)).toEqual(["2026-01-05-0930-timed.md"])
	})

	it("ignores the order the files arrive in", () => {
		const files = [
			postFile("2026-03-01-c.md"),
			postFile("2026-01-01-a.md"),
			postFile("2026-02-01-b.md"),
		]

		expect(parsedNames(files, 1)).toEqual(["2026-03-01-c.md"])
	})

	it("breaks a datetime tie by filename, so the cut is stable", () => {
		const files = [
			postFile("2026-01-05-1000-b.md"),
			postFile("2026-01-05-1000-a.md"),
		]

		expect(parsedNames(files, 1)).toEqual(["2026-01-05-1000-b.md"])
		expect(parsedNames([...files].reverse(), 1)).toEqual([
			"2026-01-05-1000-b.md",
		])
	})

	it("counts a file that skips toward the window rather than reaching further back", () => {
		const files = [
			postFile("2026-01-01-a.md"),
			postFile("2026-02-01-b.md"),
			{
				filename: "2026-03-01-c.md",
				content: buildPostFile("No slug", "Body"),
			},
		]
		const result = parseRecentPostFiles(files, 2)

		expect(result.parsed.map((file) => file.filename)).toEqual([
			"2026-02-01-b.md",
		])
		expect(result.skipped).toEqual([
			{ filename: "2026-03-01-c.md", reason: "Missing `slug:` frontmatter" },
		])
		expect(result.leftOut).toBe(1)
	})

	it("drops the skips of files outside the window", () => {
		const files = [
			{
				filename: "2026-01-01-a.md",
				content: buildPostFile("No slug", "Body"),
			},
			postFile("2026-02-01-b.md"),
		]

		expect(parseRecentPostFiles(files, 1)).toMatchObject({ skipped: [] })
	})

	it("always keeps a file with no valid datetime, as a skip outside the count", () => {
		const files = [
			postFile("2026-01-01-a.md"),
			postFile("2026-02-01-b.md"),
			postFile("2026-1-5-typo.md"),
		]
		const result = parseRecentPostFiles(files, 1)

		expect(result.parsed.map((file) => file.filename)).toEqual([
			"2026-02-01-b.md",
		])
		expect(result.skipped).toEqual([
			{
				filename: "2026-1-5-typo.md",
				reason: "Filename must be `yyyy-MM-dd[-HHmm]-Title.md`",
			},
		])
		expect(result.leftOut).toBe(1)
	})

	it("skips a new file that reuses the slug of an old file outside the window", () => {
		// Parsed alone, the new file would match the old post's row, and
		// `--overwrite` would replace that post's title, body and date.
		const files = [
			postFile("2025-06-01-original.md", "shared-slug"),
			postFile("2026-02-01-b.md"),
			postFile("2026-03-01-copy.md", "shared-slug"),
		]
		const result = parseRecentPostFiles(files, 2)

		expect(result.parsed.map((file) => file.filename)).toEqual([
			"2026-02-01-b.md",
		])
		expect(result.skipped).toEqual([
			{
				filename: "2026-03-01-copy.md",
				reason: "Duplicate slug within this batch",
			},
		])
	})
})

// #endregion
