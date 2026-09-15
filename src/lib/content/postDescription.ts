import { deriveDescription } from "@/lib/content/markdown"

// One rule for `Post.description` on every write path: the admin create and
// edit routes, the admin bulk upload, and the import script's create and
// overwrite. Each path used to carry its own rule, and they disagreed: the edit
// route replaced an authored description with a body excerpt on a Published
// toggle or a typo fix, while the importer kept it.
//
// An incoming description is one of:
//  - `undefined`: not sent. A partial update (the Published toggle sends only
//    `published`), or a file with no `description:` line;
//  - `""` or `null`: cleared. The admin form sends `""` for an emptied field;
//  - any other string: authored.
// Callers pass it after `postCreateSchema` has collapsed its whitespace, so a
// description of only spaces arrives as `""`.

type IncomingDescription = string | null | undefined

/** A new post's description: the authored one, or one derived from the body. */
export function descriptionForCreate(
	body: string,
	description: IncomingDescription
): string {
	if (description == null || description === "") {
		return deriveDescription(body)
	}

	return description
}

/**
 * The description to write when a post is updated, or `undefined` to leave the
 * column alone.
 *
 * - Cleared: derive one from the body.
 * - Authored and different from the stored one: store it.
 * - Not sent, or sent unchanged (the edit form sends the field back as it
 *   loaded it): keep the stored one, unless the body changed and the stored
 *   one was derived from the old body. Then it follows the new body: a
 *   description equal to the old body's derivation was never written by hand,
 *   so there is nothing to preserve.
 *
 * `next.body` is the body after the update: the new one when sent, the stored
 * one otherwise.
 */
export function descriptionForUpdate(
	stored: { body: string; description: string },
	next: { body: string; description: IncomingDescription }
): string | undefined {
	if (next.description === null || next.description === "") {
		return changedOrUndefined(stored.description, deriveDescription(next.body))
	}

	if (
		next.description !== undefined &&
		next.description !== stored.description
	) {
		return next.description
	}

	if (next.body === stored.body) {
		return undefined
	}

	const wasDerived = stored.description === deriveDescription(stored.body)

	if (!wasDerived) {
		return undefined
	}

	return changedOrUndefined(stored.description, deriveDescription(next.body))
}

/** `next`, or `undefined` when it would rewrite the column with the same value. */
function changedOrUndefined(stored: string, next: string): string | undefined {
	return next === stored ? undefined : next
}
