import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
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

	it("refuses a symlink in the folder that points outside it", async () => {
		// The file would be uploaded to a public URL.
		await writeFile(path.join(root, "secret.png"), "secret")
		await symlink(
			path.join(root, "secret.png"),
			path.join(folder, "media", "shot.png")
		)

		await expect(readFileInFolder(folder, "media/shot.png")).rejects.toThrow(
			'The path "media/shot.png" links outside the folder'
		)
	})

	it("refuses a path through a symlinked folder that points outside", async () => {
		await mkdir(path.join(root, "elsewhere"))
		await writeFile(path.join(root, "elsewhere", "a.png"), "outside")
		await symlink(path.join(root, "elsewhere"), path.join(folder, "linked"))

		await expect(readFileInFolder(folder, "linked/a.png")).rejects.toThrow(
			"links outside the folder"
		)
	})

	it("reads through a symlink that stays inside the folder", async () => {
		await writeFile(path.join(folder, "icon.png"), "icon")
		await symlink(
			path.join(folder, "icon.png"),
			path.join(folder, "media", "alias.png")
		)

		expect(
			(await readFileInFolder(folder, "media/alias.png"))?.toString()
		).toBe("icon")
	})

	it("reads from a folder reached through a symlink", async () => {
		await writeFile(path.join(folder, "icon.png"), "icon")
		await symlink(folder, path.join(root, "posts-link"))

		expect(
			(
				await readFileInFolder(path.join(root, "posts-link"), "icon.png")
			)?.toString()
		).toBe("icon")
	})

	it("resolves to null for a dangling symlink, as for a missing file", async () => {
		await symlink(
			path.join(folder, "gone.png"),
			path.join(folder, "media", "dangling.png")
		)

		expect(await readFileInFolder(folder, "media/dangling.png")).toBeNull()
	})

	it("reads an encoded `..` as a folder name, not as a climb out", async () => {
		await writeFile(path.join(root, "secret.png"), "secret")

		expect(await readFileInFolder(folder, "%2e%2e/secret.png")).toBeNull()
	})
})
