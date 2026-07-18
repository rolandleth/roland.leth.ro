import { chmod, rename, rm, stat, writeFile } from "node:fs/promises"

// Bumped per call and folded into the temp name so two concurrent writes to the
// same target from ONE process (a future `Promise.all` caller) can't collide on
// the temp path. The pid still separates concurrent processes.
let tempCounter = 0

/**
 * Writes `content` to `filePath` atomically: write a sibling temp file, then
 * rename it over the target. A rename within a directory is atomic on POSIX, so
 * a concurrent reader — or an in-process crash, SIGKILL, or out-of-disk
 * mid-write — never sees a truncated file; it sees either the old content or the
 * new. The content repo is the source of truth for posts, so a torn source file
 * is worse than the DB errors the import scripts already defend against.
 *
 * Not a durability guarantee: there's no `fsync`, so a kernel panic or power
 * loss between the write and the rename reaching disk can still lose the write.
 * That's an acceptable trade for a dev-machine content importer — the guarantee
 * here is "never torn", not "never lost".
 *
 * Preserves an existing target's file mode (a plain `writeFile` on the temp would
 * reset it to the default umask, silently dropping a non-default mode on
 * overwrite).
 */
export async function writeFileAtomic(
	filePath: string,
	content: string
): Promise<void> {
	const tempPath = `${filePath}.tmp-${process.pid}-${tempCounter++}`

	// Capture the target's current mode (if it exists) so the rename doesn't
	// silently reset it. Best-effort: a missing target is the common new-file
	// case, and any other stat failure just means the write below inherits the
	// default umask (and will surface its own error if the path is unwritable).
	let existingMode: number | undefined
	try {
		existingMode = (await stat(filePath)).mode
	} catch {
		existingMode = undefined
	}

	try {
		await writeFile(tempPath, content, "utf8")

		if (existingMode != null) {
			await chmod(tempPath, existingMode)
		}

		await rename(tempPath, filePath)
	} catch (error) {
		// Best-effort cleanup so a failed write doesn't strand a `.tmp` sibling;
		// the original error is what the caller needs, so a cleanup failure (the
		// temp may not exist yet) is deliberately not allowed to mask it.
		await rm(tempPath, { force: true }).catch(() => {})
		throw error
	}
}
