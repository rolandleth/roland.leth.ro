import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { isMissingPathError } from "./fsErrors"

describe("isMissingPathError", () => {
	let directory: string

	beforeEach(async () => {
		directory = await mkdtemp(path.join(tmpdir(), "fs-errors-"))
	})

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true })
	})

	async function readdirError(target: string): Promise<unknown> {
		try {
			await readdir(target)
		} catch (error) {
			return error
		}

		throw new Error(`readdir(${target}) unexpectedly succeeded`)
	}

	it("is true for a path that doesn't exist", async () => {
		const error = await readdirError(path.join(directory, "missing"))

		expect(isMissingPathError(error)).toBe(true)
	})

	it("is false for a file where a folder was expected", async () => {
		// `ENOTDIR`: something is there, so "create the folder" would be wrong advice.
		const file = path.join(directory, "file")
		await writeFile(file, "")

		expect(isMissingPathError(await readdirError(file))).toBe(false)
	})

	it.each([
		["a plain error", new Error("boom")],
		["a non-error value", "ENOENT"],
		["null", null],
	])("is false for %s", (_label, value) => {
		expect(isMissingPathError(value)).toBe(false)
	})
})
