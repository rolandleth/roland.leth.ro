export type ParsedCliArgs = {
	/** The known flags present, e.g. `--dry-run`. */
	flags: ReadonlySet<string>
	/** Arguments that aren't flags, in order: folder names, paths. */
	positionals: string[]
	/** Arguments that look like flags but aren't known ones, in order. */
	unknownFlags: string[]
}

/**
 * Splits a script's arguments into known flags, positionals and unknown flags.
 *
 * Anything that starts with `-` is a flag, and must be a known one. Only a
 * `--` prefix used to count, so a typo like `-dry-run` became a positional:
 * a folder filter that warned and then let a real, destructive import run.
 * The caller refuses to start when `unknownFlags` is non-empty.
 */
export function parseCliArgs(
	argv: readonly string[],
	knownFlags: ReadonlySet<string>
): ParsedCliArgs {
	const flags = new Set<string>()
	const positionals: string[] = []
	const unknownFlags: string[] = []

	for (const arg of argv) {
		if (!arg.startsWith("-")) {
			positionals.push(arg)
		} else if (knownFlags.has(arg)) {
			flags.add(arg)
		} else {
			unknownFlags.push(arg)
		}
	}

	return { flags, positionals, unknownFlags }
}
