import { describe, expect, it } from "vitest"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
import { deriveDescription } from "@/lib/content/markdown"
import {
	descriptionForCreate,
	descriptionForUpdate,
} from "@/lib/content/postDescription"

const TITLE = "A post title"
const OLD_BODY = "The old body of the post."
const NEW_BODY = "A new body, after an edit."
const AUTHORED = "A description written by hand."
/** A body with no prose to excerpt: `deriveDescription` omits code fences. */
const CODE_ONLY_BODY = "```ts\nconst answer = 42\n```"

/** A stored post whose description was derived from its body. */
const derivedPost = {
	title: TITLE,
	body: OLD_BODY,
	description: deriveDescription(OLD_BODY),
}

/** A stored post whose description was written by hand. */
const authoredPost = { title: TITLE, body: OLD_BODY, description: AUTHORED }

// #region descriptionForCreate

describe("descriptionForCreate", () => {
	it.each([
		["not sent", undefined],
		["null", null],
		["empty", ""],
	])(
		"derives from the body when the description is %s",
		(_label, description) => {
			expect(
				descriptionForCreate({ title: TITLE, body: NEW_BODY }, description)
			).toBe(deriveDescription(NEW_BODY))
		}
	)

	it("keeps an authored description", () => {
		expect(
			descriptionForCreate({ title: TITLE, body: NEW_BODY }, AUTHORED)
		).toBe(AUTHORED)
	})

	it.each([
		["only a code block", CODE_ONLY_BODY],
		["only an image with no alt text", "![](/img.png)"],
	])("falls back to the title for a body that is %s", (_label, body) => {
		// The excerpt is empty, and a blank meta description, feed summary and
		// llms.txt line help nobody.
		expect(deriveDescription(body)).toBe("")
		expect(descriptionForCreate({ title: TITLE, body }, undefined)).toBe(TITLE)
	})

	it("caps the title fallback at the description limit", () => {
		// `postCreateSchema` allows a 200-char title and caps `description` at 160,
		// and nothing validates a derived value. Storing the title verbatim made
		// every later save of that post 400 from the edit form.
		const title = "word ".repeat(60).trim()
		const result = descriptionForCreate(
			{ title, body: CODE_ONLY_BODY },
			undefined
		)

		expect(title.length).toBeGreaterThan(DESCRIPTION_MAX_CHARS)
		expect(result.length).toBeLessThanOrEqual(DESCRIPTION_MAX_CHARS)
		expect(result.endsWith("…")).toBe(true)
	})

	it("collapses whitespace in the title fallback", () => {
		// `postCreateSchema` collapses the description but not the title, so an
		// uncollapsed fallback is a newline's way into the `.md` frontmatter.
		const result = descriptionForCreate(
			{ title: "A title\nwith  breaks", body: CODE_ONLY_BODY },
			undefined
		)

		expect(result).toBe("A title with breaks")
	})
})

// #endregion

// #region descriptionForUpdate

describe("descriptionForUpdate — body and title unchanged", () => {
	it("writes nothing when the description isn't sent, as with the Published toggle", () => {
		expect(
			descriptionForUpdate(authoredPost, {
				title: TITLE,
				body: OLD_BODY,
				description: undefined,
			})
		).toBeUndefined()
	})

	it("writes nothing when the form sends the description back unchanged", () => {
		expect(
			descriptionForUpdate(authoredPost, {
				title: TITLE,
				body: OLD_BODY,
				description: AUTHORED,
			})
		).toBeUndefined()
	})

	it("stores a new authored description", () => {
		expect(
			descriptionForUpdate(derivedPost, {
				title: TITLE,
				body: OLD_BODY,
				description: "Something new.",
			})
		).toBe("Something new.")
	})

	it.each([
		["empty", ""],
		["null", null],
	])(
		"derives from the body when the description is cleared (%s)",
		(_label, description) => {
			expect(
				descriptionForUpdate(authoredPost, {
					title: TITLE,
					body: OLD_BODY,
					description,
				})
			).toBe(deriveDescription(OLD_BODY))
		}
	)

	it("writes nothing when a cleared description derives to what's already stored", () => {
		expect(
			descriptionForUpdate(derivedPost, {
				title: TITLE,
				body: OLD_BODY,
				description: "",
			})
		).toBeUndefined()
	})
})

describe("descriptionForUpdate — body changed", () => {
	it.each([
		["not sent", undefined],
		["sent unchanged", AUTHORED],
	])("keeps an authored description when it is %s", (_label, description) => {
		expect(
			descriptionForUpdate(authoredPost, {
				title: TITLE,
				body: NEW_BODY,
				description,
			})
		).toBeUndefined()
	})

	it.each([
		["not sent", undefined],
		["sent unchanged", deriveDescription(OLD_BODY)],
	])(
		"follows the new body when a derived description is %s",
		(_label, description) => {
			expect(
				descriptionForUpdate(derivedPost, {
					title: TITLE,
					body: NEW_BODY,
					description,
				})
			).toBe(deriveDescription(NEW_BODY))
		}
	)

	it("writes nothing when the new body derives to the same description", () => {
		// A change past the derivation's 160-char window leaves the excerpt as it was.
		const longOld = `${"word ".repeat(40)}old ending.`
		const longNew = `${"word ".repeat(40)}new ending.`
		const stored = {
			title: TITLE,
			body: longOld,
			description: deriveDescription(longOld),
		}

		expect(
			descriptionForUpdate(stored, {
				title: TITLE,
				body: longNew,
				description: undefined,
			})
		).toBeUndefined()
	})

	it("stores a new authored description over a derived one", () => {
		expect(
			descriptionForUpdate(derivedPost, {
				title: TITLE,
				body: NEW_BODY,
				description: "Something new.",
			})
		).toBe("Something new.")
	})

	it("derives from the new body when the description is cleared", () => {
		expect(
			descriptionForUpdate(authoredPost, {
				title: TITLE,
				body: NEW_BODY,
				description: "",
			})
		).toBe(deriveDescription(NEW_BODY))
	})

	it("moves from the title fallback to an excerpt once the body gains prose", () => {
		const stored = { title: TITLE, body: CODE_ONLY_BODY, description: TITLE }

		expect(
			descriptionForUpdate(stored, {
				title: TITLE,
				body: NEW_BODY,
				description: undefined,
			})
		).toBe(deriveDescription(NEW_BODY))
	})
})

describe("descriptionForUpdate — title changed", () => {
	const fallbackPost = {
		title: TITLE,
		body: CODE_ONLY_BODY,
		description: TITLE,
	}

	it("follows the new title when the stored description is the title fallback", () => {
		expect(
			descriptionForUpdate(fallbackPost, {
				title: "A renamed post",
				body: CODE_ONLY_BODY,
				description: TITLE,
			})
		).toBe("A renamed post")
	})

	it("writes nothing for a derived excerpt, which the title doesn't feed", () => {
		expect(
			descriptionForUpdate(derivedPost, {
				title: "A renamed post",
				body: OLD_BODY,
				description: undefined,
			})
		).toBeUndefined()
	})

	it("keeps a description equal to the title when the body has prose, since that one was written by hand", () => {
		// A body with prose derives an excerpt, so a description equal to the title
		// was written by hand and stays.
		const stored = { title: TITLE, body: OLD_BODY, description: TITLE }

		expect(
			descriptionForUpdate(stored, {
				title: "A renamed post",
				body: OLD_BODY,
				description: undefined,
			})
		).toBeUndefined()
	})
})

// #endregion
