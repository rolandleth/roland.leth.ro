import path from "node:path"
import { writeFileAtomic } from "@/lib/import/atomicWrite"
import { errorMessage } from "@/lib/utils/errorMessage"
import type { ParsedPostFile } from "@/lib/import/postImport"

export type SlugRewriteOutcome = {
	filename: string
	/** Human-readable description of the change, e.g. `slug: "old" → new`. */
	change: string
	result: "written" | "planned" | "failed"
	/** Present only when `result` is `"failed"`. */
	error?: string
}

/**
 * How the resolved slug is being written, phrased for the operator's log. Takes
 * the resolved values directly (not the file) so it can't be called without a
 * pending rewrite — the caller guards on `slugRewrite != null` first. A blank
 * `previous` (`""`) is a real prior value, distinct from `null` ("from title"),
 * so it renders as `slug: "" → x`.
 */
function describeChange(slug: string, previous: string | null): string {
	return previous == null
		? `slug: ${slug} (from title)`
		: `slug: "${previous}" → ${slug}`
}

/**
 * Persists each parsed file's pending `slug:` write-back into its source file
 * (dry runs only describe the change). Runs before any DB work: the rewrite is
 * deterministic and idempotent, so a later DB failure leaves the files correct
 * and a re-run finds the slugs already explicit.
 *
 * Writes are atomic, and one file's failure is captured as a `"failed"` outcome
 * rather than thrown — the batch and the DB import still proceed, because the
 * resolved slug is already in memory (only the on-disk backfill is missing) and
 * a re-run retries it. The caller surfaces the failures and decides the exit code.
 */
export async function applySlugRewrites(
	folder: string,
	parsed: readonly ParsedPostFile[],
	isDryRun: boolean
): Promise<SlugRewriteOutcome[]> {
	const outcomes: SlugRewriteOutcome[] = []

	for (const file of parsed) {
		if (file.slugRewrite == null) {
			continue
		}

		const change = describeChange(file.slug, file.slugRewrite.previous)

		if (isDryRun) {
			outcomes.push({ filename: file.filename, change, result: "planned" })
			continue
		}

		try {
			await writeFileAtomic(
				path.join(folder, file.filename),
				file.slugRewrite.content
			)
			outcomes.push({ filename: file.filename, change, result: "written" })
		} catch (error) {
			outcomes.push({
				filename: file.filename,
				change,
				result: "failed",
				error: errorMessage(error),
			})
		}
	}

	return outcomes
}
