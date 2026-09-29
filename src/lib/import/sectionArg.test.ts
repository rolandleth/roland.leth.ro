import { describe, expect, it } from "vitest"
import { parsePostScriptArgs, resolveSectionArg } from "./sectionArg"

const INVALID_EXPORT_PROBLEM =
	'"export" is not a valid section. Use --section=<section> or point at a folder named after one.'

describe("resolveSectionArg", () => {
	it("takes the section from the folder's name when no flag is given", () => {
		expect(resolveSectionArg("../blog/posts/tech", undefined)).toEqual({
			section: "tech",
		})
		expect(resolveSectionArg("../blog/posts/life/", undefined)).toEqual({
			section: "life",
		})
	})

	it("prefers the flag over the folder's name", () => {
		expect(resolveSectionArg("../blog/posts/tech", "life")).toEqual({
			section: "life",
		})
	})

	it("returns a problem for a folder not named after a section", () => {
		expect(resolveSectionArg("../blog/export", undefined)).toEqual({
			problem: INVALID_EXPORT_PROBLEM,
		})
	})

	it("returns a problem for an invalid flag, even in a section-named folder", () => {
		expect(resolveSectionArg("../blog/posts/tech", "Tech")).toHaveProperty(
			"problem"
		)
	})

	it("returns a problem for an empty flag rather than falling back to the folder", () => {
		// `--section=` with no value is a mistake, not "use the default".
		expect(resolveSectionArg("../blog/posts/tech", "")).toEqual({
			problem:
				'"" is not a valid section. Use --section=<section> or point at a folder named after one.',
		})
	})
})

describe("parsePostScriptArgs", () => {
	const SPEC = {
		command: "yarn db:import-posts",
		knownFlags: new Set(["--overwrite", "--dry-run"]),
	}
	const USAGE =
		"Usage: yarn db:import-posts <folder> [--section=<section>] [--overwrite] [--dry-run]"

	it("resolves the folder and its section for a valid run", () => {
		const result = parsePostScriptArgs(
			["../blog/posts/tech", "--dry-run"],
			SPEC
		)

		expect(result).toMatchObject({
			problem: null,
			folder: "../blog/posts/tech",
			section: "tech",
		})
		expect(result.flags.has("--dry-run")).toBe(true)
	})

	it("takes the section from the flag over the folder's name", () => {
		expect(
			parsePostScriptArgs(["../blog/export", "--section=life"], SPEC)
		).toMatchObject({ problem: null, section: "life" })
	})

	it("refuses a repeated --section rather than picking one", () => {
		// It used to be first-wins in init-post-slugs: a silent pick between
		// two conflicting targets.
		expect(
			parsePostScriptArgs(
				["../blog/posts/tech", "--section=tech", "--section=life"],
				SPEC
			).problem
		).toBe("Flag(s) given more than once: --section. Pass each one once.")
	})

	it("refuses a single-dash typo rather than reading it as a folder", () => {
		expect(
			parsePostScriptArgs(["../blog/posts/tech", "-dry-run"], SPEC).problem
		).toBe(
			"Unknown flag(s): -dry-run. Supported: --overwrite, --dry-run, --section=<section>."
		)
	})

	it("refuses a missing folder with the usage line", () => {
		expect(parsePostScriptArgs(["--dry-run"], SPEC).problem).toBe(USAGE)
	})

	it("refuses a folder not named after a section, with no flag to fix it", () => {
		const result = parsePostScriptArgs(["../blog/export"], SPEC)

		expect(result.problem).toBe(INVALID_EXPORT_PROBLEM)
		expect(result).not.toHaveProperty("section")
	})

	it("refuses an empty --section", () => {
		expect(
			parsePostScriptArgs(["../blog/posts/tech", "--section="], SPEC).problem
		).toMatch(/^"" is not a valid section\./)
	})
})
