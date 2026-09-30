import path from "node:path"
import { isValidSection, type Section, SECTIONS } from "@/lib/db/sections"
import {
	type CliSpec,
	type ParsedCliArgs,
	parseScriptArgs,
	valueFlagPlaceholder,
} from "./cliArgs"

export const SECTION_FLAG = "--section"

export type PostScriptArgs = ParsedCliArgs &
	({ problem: string } | { problem: null; folder: string; section: Section })

/**
 * Parses a post script's arguments: exactly one `<folder>`, an optional
 * `--section=`, and the script's own boolean flags. On top of the shared
 * checks, the section must resolve (see `resolveSectionArg`); `folder` and
 * `section` are set only when `problem` is `null`.
 */
export function parsePostScriptArgs(
	argv: readonly string[],
	spec: Pick<CliSpec, "command" | "knownFlags">
): PostScriptArgs {
	const parsed = parseScriptArgs(argv, {
		...spec,
		positionals: { count: "one", name: "folder" },
		valueFlags: new Set([SECTION_FLAG]),
	})

	if (parsed.problem != null) {
		return { ...parsed, problem: parsed.problem }
	}

	const folder = parsed.positionals[0]
	const resolved = resolveSectionArg(folder, parsed.values.get(SECTION_FLAG))

	if ("problem" in resolved) {
		return { ...parsed, problem: resolved.problem }
	}

	return { ...parsed, problem: null, folder, section: resolved.section }
}

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
			problem: `"${candidate}" is not a valid section (${SECTIONS.join(", ")}). Use ${valueFlagPlaceholder(SECTION_FLAG)} or point at a folder named after one.`,
		}
	}

	return { section: candidate }
}
