import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { readFileInFolder } from "./localFiles"

describe("readFileInFolder", () => {
	let root: string
	let folder: string

	beforeEach(async () => {
		// `folder` sits one level down, so a test can put a real file outside it.
		root = await mkdtemp(path.join(tmpdir(), "local-files-"))
		folder = path.join(root, "posts")
		await mkdir(path.join(folder, "media", "my-post"), { recursive: true })
	})

	afterEach(async () => {
		await rm(root, { recursive: true, force: true })
	})

	it("reads a file by its path relative to the folder", async () => {
		await writeFile(path.join(folder, "media", "my-post", "shot.png"), "bytes")

		const bytes = await readFileInFolder(folder, "media/my-post/shot.png")

		expect(bytes?.toString()).toBe("bytes")
	})

	it.each([
		["at the top of the folder", "icon.png"],
		["through a ./ prefix", "./icon.png"],
		[
			"through a path that leaves a subfolder and stays inside",
			"media/../icon.png",
		],
	])("reads a file %s", async (_label, relativePath) => {
		await writeFile(path.join(folder, "icon.png"), "icon")

		expect((await readFileInFolder(folder, relativePath))?.toString()).toBe(
			"icon"
		)
	})

	it("reads an empty file as empty, not as missing", async () => {
		await writeFile(path.join(folder, "empty.png"), "")

		const bytes = await readFileInFolder(folder, "empty.png")

		expect(bytes).not.toBeNull()
		expect(bytes?.length).toBe(0)
	})

	it("resolves to null for a file that isn't there", async () => {
		expect(await readFileInFolder(folder, "media/missing.png")).toBeNull()
	})

	it("resolves to null when a folder on the way isn't there", async () => {
		expect(await readFileInFolder(folder, "nowhere/shot.png")).toBeNull()
	})

	it("refuses a path that climbs out of the folder, even to a real file", async () => {
		await writeFile(path.join(root, "secret.png"), "secret")

		await expect(readFileInFolder(folder, "../secret.png")).rejects.toThrow(
			'The path "../secret.png" escapes the folder'
		)
	})

	it("refuses a path that climbs out midway", async () => {
		await writeFile(path.join(root, "secret.png"), "secret")

		await expect(
			readFileInFolder(folder, "media/../../secret.png")
		).rejects.toThrow("escapes the folder")
	})

	it("refuses an absolute path", async () => {
		const outside = path.join(root, "secret.png")
		await writeFile(outside, "secret")

		await expect(readFileInFolder(folder, outside)).rejects.toThrow(
			"escapes the folder"
		)
	})

	it("refuses a sibling folder whose name only starts the same", async () => {
		// `posts-old/a.png` starts with the string `…/posts` but is not inside it.
		await mkdir(path.join(root, "posts-old"))
		await writeFile(path.join(root, "posts-old", "a.png"), "old")

		await expect(
			readFileInFolder(folder, "../posts-old/a.png")
		).rejects.toThrow("escapes the folder")
	})

	it("reports a folder at the path as a read failure, not as missing", async () => {
		await expect(readFileInFolder(folder, "media")).rejects.toThrow(
			/^Could not read media: /
		)
	})
})
