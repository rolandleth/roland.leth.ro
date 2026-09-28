import { describe, expect, it } from "vitest"
import { flagsProblem, parseCliArgs } from "./cliArgs"

const KNOWN = new Set(["--dry-run", "--cleanup"])

describe("parseCliArgs", () => {
	it("splits known flags from positionals", () => {
		const result = parseCliArgs(["reckon", "--dry-run", "continuum"], KNOWN)

		expect([...result.flags]).toEqual(["--dry-run"])
		expect(result.positionals).toEqual(["reckon", "continuum"])
		expect(result.unknownFlags).toEqual([])
	})

	it("reports a single-dash typo as an unknown flag, not a positional", () => {
		// `reckon -dry-run` used to import `reckon` for real, with `-dry-run`
		// read as a second folder name.
		const result = parseCliArgs(["reckon", "-dry-run"], KNOWN)

		expect(result.unknownFlags).toEqual(["-dry-run"])
		expect(result.positionals).toEqual(["reckon"])
		expect(result.flags.has("--dry-run")).toBe(false)
	})

	it("reports a misspelled double-dash flag as unknown", () => {
		const result = parseCliArgs(["--dryrun"], KNOWN)

		expect(result.unknownFlags).toEqual(["--dryrun"])
	})

	it("treats a lone dash as an unknown flag", () => {
		expect(parseCliArgs(["-"], KNOWN).unknownFlags).toEqual(["-"])
	})

	it("returns nothing for no arguments", () => {
		const result = parseCliArgs([], KNOWN)

		expect(result.flags.size).toBe(0)
		expect(result.values.size).toBe(0)
		expect(result.positionals).toEqual([])
		expect(result.unknownFlags).toEqual([])
		expect(result.repeatedValueFlags).toEqual([])
	})

	it("reports a known flag given a value as unknown", () => {
		expect(parseCliArgs(["--dry-run=true"], KNOWN).unknownFlags).toEqual([
			"--dry-run=true",
		])
	})

	it("treats `--` as an unknown flag rather than an end-of-flags marker", () => {
		const result = parseCliArgs(["--", "-dry-run"], KNOWN)

		expect(result.unknownFlags).toEqual(["--", "-dry-run"])
		expect(result.positionals).toEqual([])
	})

	it("collapses a repeated boolean flag", () => {
		const result = parseCliArgs(["--dry-run", "--dry-run"], KNOWN)

		expect([...result.flags]).toEqual(["--dry-run"])
		expect(result.unknownFlags).toEqual([])
	})

	it("reports every unknown flag among positionals, in order", () => {
		const result = parseCliArgs(
			["reckon", "--nope", "--dry-run", "continuum", "-x"],
			KNOWN
		)

		expect(result.unknownFlags).toEqual(["--nope", "-x"])
		expect(result.positionals).toEqual(["reckon", "continuum"])
		expect([...result.flags]).toEqual(["--dry-run"])
	})

	// #region value flags

	const VALUE_FLAGS = new Set(["--section"])

	it("reads a value flag's value after `=`", () => {
		const result = parseCliArgs(
			["../blog", "--section=tech", "--dry-run"],
			KNOWN,
			VALUE_FLAGS
		)

		expect(result.values.get("--section")).toBe("tech")
		expect(result.positionals).toEqual(["../blog"])
		expect(result.unknownFlags).toEqual([])
	})

	it("keeps an empty value, leaving its validation to the caller", () => {
		const result = parseCliArgs(["--section="], KNOWN, VALUE_FLAGS)

		expect(result.values.get("--section")).toBe("")
		expect(result.unknownFlags).toEqual([])
	})

	it("keeps everything after the first `=` as the value", () => {
		const result = parseCliArgs(["--section=a=b"], KNOWN, VALUE_FLAGS)

		expect(result.values.get("--section")).toBe("a=b")
	})

	it("reports the spaced form as unknown, so its value can't become a positional target", () => {
		const result = parseCliArgs(["--section", "tech"], KNOWN, VALUE_FLAGS)

		expect(result.unknownFlags).toEqual(["--section"])
		expect(result.values.has("--section")).toBe(false)
	})

	it("reports a single-dash value flag as unknown", () => {
		const result = parseCliArgs(["-section=tech"], KNOWN, VALUE_FLAGS)

		expect(result.unknownFlags).toEqual(["-section=tech"])
	})

	it("reports a repeated value flag once, keeping the first value", () => {
		const result = parseCliArgs(
			["--section=tech", "--section=life", "--section=tech"],
			KNOWN,
			VALUE_FLAGS
		)

		expect(result.repeatedValueFlags).toEqual(["--section"])
		expect(result.values.get("--section")).toBe("tech")
	})

	it("treats an unlisted value flag as unknown", () => {
		expect(parseCliArgs(["--section=tech"], KNOWN).unknownFlags).toEqual([
			"--section=tech",
		])
	})

	// #endregion
})

describe("flagsProblem", () => {
	const VALUE = new Set(["--section"])

	function problemFor(argv: string[]): string | null {
		return flagsProblem(parseCliArgs(argv, KNOWN, VALUE), KNOWN, VALUE)
	}

	it("returns null for known flags and any positionals", () => {
		expect(problemFor(["a", "b", "--dry-run", "--section=tech"])).toBeNull()
		expect(problemFor([])).toBeNull()
	})

	it("names every unknown flag and lists the supported ones, value flags included", () => {
		expect(problemFor(["-dry-run", "--force"])).toBe(
			"Unknown flag(s): -dry-run, --force. Supported: --dry-run, --cleanup, --section=<section>."
		)
	})

	it("lists only the boolean flags when a script has no value flags", () => {
		const problem = flagsProblem(parseCliArgs(["--nope"], KNOWN), KNOWN)

		expect(problem).toBe(
			"Unknown flag(s): --nope. Supported: --dry-run, --cleanup."
		)
	})

	it("refuses a repeated value flag", () => {
		expect(problemFor(["--section=tech", "--section=life"])).toBe(
			"Flag(s) given more than once: --section. Pass each one once."
		)
	})

	it("reports unknown flags before repeated ones", () => {
		expect(problemFor(["--section=tech", "--section=life", "--nope"])).toMatch(
			/^Unknown flag\(s\): --nope\./
		)
	})
})
