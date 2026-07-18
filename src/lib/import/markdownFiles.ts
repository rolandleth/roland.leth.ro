import type { Dirent } from "node:fs"

/**
 * The sorted `.md` filenames among a directory's entries. Every import script
 * lists markdown the same way — filter to files ending in `.md`, take the name,
 * sort for a stable order — so it lives here rather than being re-hand-rolled at
 * each `readdir` call site. Takes `Dirent[]` (from `readdir(dir, {
 * withFileTypes: true })`) so callers that also need the directory entries don't
 * have to read the directory twice.
 */
export function sortedMarkdownNames(entries: readonly Dirent[]): string[] {
	return entries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => entry.name)
		.sort()
}
