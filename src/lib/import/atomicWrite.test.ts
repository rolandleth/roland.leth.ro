import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { writeFileAtomic } from "./atomicWrite"

describe("writeFileAtomic", () => {
	let folder: string

	beforeEach(async () => {
		folder = await mkdtemp(path.join(tmpdir(), "rlr-atomic-"))
	})

	afterEach(async () => {
		await rm(folder, { recursive: true, force: true })
	})

	it("writes a new file and leaves no temp sibling", async () => {
		const target = path.join(folder, "new.md")

		await writeFileAtomic(target, "hello")

		expect(await readFile(target, "utf8")).toBe("hello")
		expect(await readdir(folder)).toEqual(["new.md"])
	})

	it("round-trips CRLF and unicode byte-for-byte", async () => {
		const target = path.join(folder, "content.md")
		const content = "line1\r\nlíne2 — ✓\r\n"

		await writeFileAtomic(target, content)

		expect(await readFile(target, "utf8")).toBe(content)
	})

	it("overwrites an existing file", async () => {
		const target = path.join(folder, "existing.md")
		await writeFile(target, "old", "utf8")

		await writeFileAtomic(target, "new")

		expect(await readFile(target, "utf8")).toBe("new")
		expect(await readdir(folder)).toEqual(["existing.md"])
	})

	it("preserves the existing file's mode on overwrite", async () => {
		const target = path.join(folder, "restricted.md")
		await writeFile(target, "old", "utf8")
		await chmod(target, 0o600)

		await writeFileAtomic(target, "new")

		// Low bits only: the platform's umask doesn't touch an explicit chmod.
		expect((await stat(target)).mode & 0o777).toBe(0o600)
	})

	it("cleans up the temp file when the write fails", async () => {
		// A directory at the target path makes the rename-over fail; the temp write
		// itself succeeds, so this exercises the cleanup-after-rename-failure path.
		const target = path.join(folder, "blocked")
		await mkdir(target)
		await writeFile(path.join(target, "keep"), "x", "utf8")

		await expect(writeFileAtomic(target, "new")).rejects.toThrow()

		// No `.tmp` sibling left stranded next to the blocked target.
		expect(
			(await readdir(folder)).filter((name) => name.includes(".tmp"))
		).toEqual([])
	})

	// The primitive is exported and a future caller may parallelize it; two
	// concurrent writes to the same path must both settle without colliding on the
	// temp name, and must leave exactly one file and no temp sibling.
	it("handles concurrent same-process writes to the same target", async () => {
		const target = path.join(folder, "raced.md")

		await Promise.all([
			writeFileAtomic(target, "a"),
			writeFileAtomic(target, "b"),
		])

		expect(["a", "b"]).toContain(await readFile(target, "utf8"))
		expect(await readdir(folder)).toEqual(["raced.md"])
	})
})
