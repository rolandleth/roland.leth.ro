import { readFile } from "node:fs/promises"
import path from "node:path"
import { isMissingPathError } from "@/lib/import/fsErrors"
import { errorMessage } from "@/lib/utils/errorMessage"

/**
 * Reads a file by its path relative to `folder`, for the importers' staged
 * media: a project's images, a post's images and videos. Resolves to `null`
 * when there is no such file, so each importer words that in its own terms.
 *
 * Throws for a path that resolves outside the folder. These are first-party
 * files, so that is a typo in a manifest or a post, not an attack; it is still
 * refused, because the blob key is built from the path. Throws as well for any
 * other read failure (a permission error, a folder at that path), reported as
 * it is rather than as "not found".
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
		return await readFile(absolutePath)
	} catch (error) {
		if (isMissingPathError(error)) {
			return null
		}

		throw new Error(`Could not read ${relativePath}: ${errorMessage(error)}`)
	}
}
