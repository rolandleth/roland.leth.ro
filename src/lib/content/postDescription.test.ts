import { describe, expect, it } from "vitest"
import { deriveDescription } from "@/lib/content/markdown"
import {
	descriptionForCreate,
	descriptionForUpdate,
} from "@/lib/content/postDescription"

const OLD_BODY = "The old body of the post."
const NEW_BODY = "A new body, after an edit."
const AUTHORED = "A description written by hand."

/** A stored post whose description was derived from its body. */
const derivedPost = { body: OLD_BODY, description: deriveDescription(OLD_BODY) }

/** A stored post whose description was written by hand. */
const authoredPost = { body: OLD_BODY, description: AUTHORED }

// #region descriptionForCreate

describe("descriptionForCreate", () => {
	it.each([
		["not sent", undefined],
		["null", null],
		["empty", ""],
	])(
		"derives from the body when the description is %s",
		(_label, description) => {
			expect(descriptionForCreate(NEW_BODY, description)).toBe(
				deriveDescription(NEW_BODY)
			)
		}
	)

	it("keeps an authored description", () => {
		expect(descriptionForCreate(NEW_BODY, AUTHORED)).toBe(AUTHORED)
	})
})

// #endregion

// #region descriptionForUpdate

describe("descriptionForUpdate — body unchanged", () => {
	it("writes nothing when the description isn't sent, as with the Published toggle", () => {
		expect(
			descriptionForUpdate(authoredPost, {
				body: OLD_BODY,
				description: undefined,
			})
		).toBeUndefined()
	})

	it("writes nothing when the form sends the description back unchanged", () => {
		expect(
			descriptionForUpdate(authoredPost, {
				body: OLD_BODY,
				description: AUTHORED,
			})
		).toBeUndefined()
	})

	it("stores a new authored description", () => {
		expect(
			descriptionForUpdate(derivedPost, {
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
				descriptionForUpdate(authoredPost, { body: OLD_BODY, description })
			).toBe(deriveDescription(OLD_BODY))
		}
	)

	it("writes nothing when a cleared description derives to what's already stored", () => {
		expect(
			descriptionForUpdate(derivedPost, { body: OLD_BODY, description: "" })
		).toBeUndefined()
	})
})

describe("descriptionForUpdate — body changed", () => {
	it.each([
		["not sent", undefined],
		["sent unchanged", AUTHORED],
	])("keeps an authored description when it is %s", (_label, description) => {
		expect(
			descriptionForUpdate(authoredPost, { body: NEW_BODY, description })
		).toBeUndefined()
	})

	it.each([
		["not sent", undefined],
		["sent unchanged", deriveDescription(OLD_BODY)],
	])(
		"follows the new body when a derived description is %s",
		(_label, description) => {
			expect(
				descriptionForUpdate(derivedPost, { body: NEW_BODY, description })
			).toBe(deriveDescription(NEW_BODY))
		}
	)

	it("writes nothing when the new body derives to the same description", () => {
		// A change past the derivation's 160-char window leaves the excerpt as it was.
		const longOld = `${"word ".repeat(40)}old ending.`
		const longNew = `${"word ".repeat(40)}new ending.`
		const stored = { body: longOld, description: deriveDescription(longOld) }

		expect(
			descriptionForUpdate(stored, { body: longNew, description: undefined })
		).toBeUndefined()
	})

	it("stores a new authored description over a derived one", () => {
		expect(
			descriptionForUpdate(derivedPost, {
				body: NEW_BODY,
				description: "Something new.",
			})
		).toBe("Something new.")
	})

	it("derives from the new body when the description is cleared", () => {
		expect(
			descriptionForUpdate(authoredPost, { body: NEW_BODY, description: "" })
		).toBe(deriveDescription(NEW_BODY))
	})
})

// #endregion
