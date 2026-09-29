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

/**
 * How many positionals a script takes, and what its usage line calls them:
 * exactly one (a folder), any number (filters), or none.
 */
export type PositionalSpec =
	| { count: "one"; name: string }
	| { count: "any"; name: string }
	| { count: "none" }

/**
 * Everything a script's argument check and usage line derive from. One object
 * feeds the parse, the "Supported" list and the usage line, so none of them
 * can drift from the flags the script honours.
 */
export type CliSpec = {
	/** How the script is run, as the usage line prints it: `yarn db:import-posts`. */
	command: string
	positionals: PositionalSpec
	knownFlags: ReadonlySet<string>
	valueFlags?: ReadonlySet<string>
}

export type ParsedScriptArgs = ParsedCliArgs & {
	/** The reason these arguments can't start a run, or `null` when they can. */
	problem: string | null
}

/**
 * Parses a script's arguments against its spec and names the first reason they
 * can't start a run: an unknown flag, a repeated value flag, then a wrong
 * positional count. The script refuses to start when `problem` is set, before
 * it touches any folder, database or blob store.
 */
export function parseScriptArgs(
	argv: readonly string[],
	spec: CliSpec
): ParsedScriptArgs {
	const parsed = parseCliArgs(argv, spec.knownFlags, spec.valueFlags)

	return {
		...parsed,
		problem: flagsProblem(parsed, spec) ?? positionalsProblem(parsed, spec),
	}
}

/**
 * The script's usage line, flags in spec order:
 * `Usage: yarn db:import-posts <folder> [--section=<section>] [--dry-run]`.
 */
export function cliUsage(spec: CliSpec): string {
	const parts = [spec.command]

	switch (spec.positionals.count) {
		case "one":
			parts.push(`<${spec.positionals.name}>`)
			break
		case "any":
			parts.push(`[${spec.positionals.name}…]`)
			break
		case "none":
			break
	}

	for (const flag of spec.valueFlags ?? []) {
		parts.push(`[${valueFlagPlaceholder(flag)}]`)
	}

	for (const flag of spec.knownFlags) {
		parts.push(`[${flag}]`)
	}

	return `Usage: ${parts.join(" ")}`
}

/** How a value flag is written in messages: `--section` → `--section=<section>`. */
export function valueFlagPlaceholder(flag: string): string {
	return `${flag}=<${flag.replace(/^-+/, "")}>`
}

/**
 * The reason a script's flags can't start a run, or `null` when they can: any
 * unknown flag, then any repeated value flag.
 */
export function flagsProblem(
	parsed: ParsedCliArgs,
	spec: Pick<CliSpec, "knownFlags" | "valueFlags">
): string | null {
	if (parsed.unknownFlags.length > 0) {
		const supported = [
			...spec.knownFlags,
			...[...(spec.valueFlags ?? [])].map(valueFlagPlaceholder),
		]

		return `Unknown flag(s): ${parsed.unknownFlags.join(", ")}. Supported: ${supported.join(", ")}.`
	}

	if (parsed.repeatedValueFlags.length > 0) {
		return `Flag(s) given more than once: ${parsed.repeatedValueFlags.join(", ")}. Pass each one once.`
	}

	return null
}

function positionalsProblem(
	parsed: ParsedCliArgs,
	spec: CliSpec
): string | null {
	const { positionals } = parsed

	switch (spec.positionals.count) {
		case "one":
			return positionals.length === 1 ? null : cliUsage(spec)
		case "any":
			return null
		case "none":
			// A bare word here is a typo (`apply` for `--apply`), not a target.
			return positionals.length === 0
				? null
				: `Unexpected argument(s): ${positionals.join(", ")}. ${cliUsage(spec)}`
	}
}
