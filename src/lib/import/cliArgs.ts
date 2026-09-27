export type ParsedCliArgs = {
	/** The known flags present, e.g. `--dry-run`. */
	flags: ReadonlySet<string>
	/** Values of the known value flags present, keyed by name: `--section=tech` → `--section` → `tech`. */
	values: ReadonlyMap<string, string>
	/** Arguments that aren't flags, in order: folder names, paths. */
	positionals: string[]
	/** Arguments that look like flags but aren't known ones, in order. */
	unknownFlags: string[]
	/** Value flags given more than once, by name, in order of first repeat. */
	repeatedValueFlags: string[]
}

/**
 * Splits a script's arguments into known flags, value flags, positionals and
 * unknown flags.
 *
 * Anything that starts with `-` is a flag, and must be a known one. Only a
 * `--` prefix used to count, so a typo like `-dry-run` became a positional:
 * a folder filter that warned and then let a real, destructive import run.
 * The caller refuses to start when `unknownFlags` is non-empty.
 *
 * A value flag takes its value after `=` only (`--section=tech`); the spaced
 * form `--section tech` is an unknown flag, so it can't turn the value into a
 * positional. A repeated value flag is reported rather than resolved: first or
 * last wins would both silently pick one of two conflicting targets. The caller
 * refuses to start when `repeatedValueFlags` is non-empty.
 */
export function parseCliArgs(
	argv: readonly string[],
	knownFlags: ReadonlySet<string>,
	valueFlags: ReadonlySet<string> = new Set()
): ParsedCliArgs {
	const flags = new Set<string>()
	const values = new Map<string, string>()
	const positionals: string[] = []
	const unknownFlags: string[] = []
	const repeatedValueFlags: string[] = []

	for (const arg of argv) {
		if (!arg.startsWith("-")) {
			positionals.push(arg)

			continue
		}

		if (knownFlags.has(arg)) {
			flags.add(arg)

			continue
		}

		const separatorIndex = arg.indexOf("=")
		const name = separatorIndex === -1 ? arg : arg.slice(0, separatorIndex)

		if (separatorIndex === -1 || !valueFlags.has(name)) {
			unknownFlags.push(arg)

			continue
		}

		if (values.has(name)) {
			if (!repeatedValueFlags.includes(name)) {
				repeatedValueFlags.push(name)
			}

			continue
		}

		values.set(name, arg.slice(separatorIndex + 1))
	}

	return { flags, values, positionals, unknownFlags, repeatedValueFlags }
}
