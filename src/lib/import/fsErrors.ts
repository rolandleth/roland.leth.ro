/**
 * Whether a Node filesystem call failed because the path doesn't exist
 * (`ENOENT`), as opposed to any other failure: a permission error, a file where
 * a folder was expected. Scripts treat the first as "nothing there yet" and must
 * report the rest as they are.
 */
export function isMissingPathError(error: unknown): boolean {
	return (
		error instanceof Error &&
		"code" in error &&
		(error as NodeJS.ErrnoException).code === "ENOENT"
	)
}
