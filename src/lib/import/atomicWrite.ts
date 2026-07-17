import { rename, rm, writeFile } from "node:fs/promises"

/**
 * Writes `content` to `filePath` atomically: write a sibling temp file, then
 * rename it over the target. A rename within a directory is atomic on POSIX, so
 * a concurrent reader — or a crash, SIGKILL, or out-of-disk mid-write — never
 * sees a truncated file; it sees either the old content or the new. The content
 * repo is the source of truth for posts, so a torn source file is worse than
 * the DB errors the import scripts already defend against.
 */
export async function writeFileAtomic(
	filePath: string,
	content: string
): Promise<void> {
	// PID-suffixed so two overlapping runs can't race on the same temp path.
	const tempPath = `${filePath}.tmp-${process.pid}`

	try {
		await writeFile(tempPath, content, "utf8")
		await rename(tempPath, filePath)
	} catch (error) {
		// Best-effort cleanup so a failed write doesn't strand a `.tmp` sibling;
		// the original error is what the caller needs, so a cleanup failure (the
		// temp may not exist yet) is deliberately not allowed to mask it.
		await rm(tempPath, { force: true }).catch(() => {})
		throw error
	}
}
