import path from "node:path"
import { isValidSection, type Section } from "@/lib/db/sections"

/**
 * Resolves a post script's target section: the explicit `--section=` value
 * when present, otherwise the folder's basename (`…/posts/tech` → `tech`).
 *
 * Anything else is a `problem` rather than a guess: importing or stamping into
 * the wrong section is a cross-section mess to untangle, not a typo to shrug
 * at. Returned rather than thrown, so the script prints it as one usage line
 * next to its other argument errors instead of a stack trace.
 */
export function resolveSectionArg(
	folder: string,
	flag: string | undefined
): { section: Section } | { problem: string } {
	const candidate = flag ?? path.basename(path.resolve(folder))

	if (!isValidSection(candidate)) {
		return {
			problem: `"${candidate}" is not a valid section. Use --section=<value> or point at a folder named after one.`,
		}
	}

	return { section: candidate }
}
