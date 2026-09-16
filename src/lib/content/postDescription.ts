import {
	capDescription,
	collapseWhitespace,
} from "@/lib/content/descriptionRules"
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

/** The two fields a derived description is built from. */
interface PostText {
	title: string
	body: string
}

/**
 * What a post's description derives to: the body excerpt, or the title when the
 * body has no prose to excerpt (only a code block, or an image with no alt text).
 * The column is the meta description, the feed `<summary>` and the llms.txt line,
 * so a blank one would ship empty on all three.
 *
 * The title goes through the same collapse and cap as the excerpt. It is not
 * validated anywhere else on this path: `postCreateSchema` allows a 200-char
 * title and caps `description` at 160, and it collapses whitespace on the
 * description but not on the title. Without this, a prose-less body under a long
 * title stores an over-cap description that the edit form then rejects on every
 * save, and a title with a newline reaches the `.md` export's frontmatter.
 */
function derivedDescription(post: PostText): string {
	const excerpt = deriveDescription(post.body)

	return excerpt === ""
		? capDescription(collapseWhitespace(post.title))
		: excerpt
}

/** A new post's description: the authored one, or a derived one. */
export function descriptionForCreate(
	post: PostText,
	description: IncomingDescription
): string {
	if (description == null || description === "") {
		return derivedDescription(post)
	}

	return description
}

/**
 * The description to write when a post is updated, or `undefined` to leave the
 * column alone.
 *
 * - Cleared: derive one.
 * - Authored and different from the stored one: store it.
 * - Not sent, or sent unchanged (the edit form sends the field back as it
 *   loaded it): keep the stored one, unless the body or title changed and the
 *   stored one was derived from the old ones. Then it follows the new text: a
 *   description equal to the old derivation was never written by hand, so there
 *   is nothing to preserve.
 *
 * `next` carries the title and body after the update: the new ones when sent,
 * the stored ones otherwise.
 */
export function descriptionForUpdate(
	stored: PostText & { description: string },
	next: PostText & { description: IncomingDescription }
): string | undefined {
	if (next.description === null || next.description === "") {
		return changedOrUndefined(stored.description, derivedDescription(next))
	}

	if (
		next.description !== undefined &&
		next.description !== stored.description
	) {
		return next.description
	}

	if (next.body === stored.body && next.title === stored.title) {
		return undefined
	}

	const wasDerived = stored.description === derivedDescription(stored)

	if (!wasDerived) {
		return undefined
	}

	return changedOrUndefined(stored.description, derivedDescription(next))
}

/** `next`, or `undefined` when it would rewrite the column with the same value. */
function changedOrUndefined(stored: string, next: string): string | undefined {
	return next === stored ? undefined : next
}
