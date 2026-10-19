import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { isMissingPathError } from "@/lib/import/fsErrors"
import { errorMessage } from "@/lib/utils/errorMessage"

/**
 * Reads a file by its path relative to `folder`, for the importers' staged
 * media: a project's images, a post's images and videos. Resolves to `null`
 * when there is no such file, so each importer words that in its own terms.
 *
 * Throws for a path that resolves outside the folder, as written or through a
 * symlink: the file is uploaded to a public URL, so a link in the folder that
 * points elsewhere must not carry another file out. These are first-party
 * files, so that is a mistake, not an attack; it is still refused, because the
 * blob key is built from the path. Throws as well for any other read failure
 * (a permission error, a folder at that path), reported as it is rather than
 * as "not found". The path is used as written: `%2e%2e` is a folder name, not
 * `..`.
 */
export async function readFileInFolder(
	folder: string,
	relativePath: string
): Promise<Buffer | null> {
	const folderPrefix = path.resolve(folder) + path.sep
	const absolutePath = path.resolve(folder, relativePath)

	if (!absolutePath.startsWith(folderPrefix)) {
		throw new Error(`The path "${relativePath}" escapes the folder ${folder}.`)
	}

	try {
		// Both sides through their links: the folder itself may be one.
		const [realFolder, realFile] = await Promise.all([
			realpath(folder),
			realpath(absolutePath),
		])

		if (!realFile.startsWith(realFolder + path.sep)) {
			throw new FolderEscapeError(
				`The path "${relativePath}" links outside the folder ${folder}.`
			)
		}

		return await readFile(realFile)
	} catch (error) {
		if (error instanceof FolderEscapeError) {
			throw error
		}

		if (isMissingPathError(error)) {
			return null
		}

		throw new Error(`Could not read ${relativePath}: ${errorMessage(error)}`)
	}
}

/** A path that leaves the folder through a symlink; never read as "missing". */
class FolderEscapeError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "FolderEscapeError"
	}
}
