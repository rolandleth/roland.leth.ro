import { describe, expect, it } from "vitest"
import { parseCliArgs } from "./cliArgs"

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
		expect(result.positionals).toEqual([])
		expect(result.unknownFlags).toEqual([])
	})
})
