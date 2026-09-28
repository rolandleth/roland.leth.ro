import { describe, expect, it } from "vitest"
import { resolveSectionArg } from "./sectionArg"

describe("resolveSectionArg", () => {
	it("takes the section from the folder's name when no flag is given", () => {
		expect(resolveSectionArg("../blog/posts/tech", undefined)).toEqual({
			section: "tech",
		})
		expect(resolveSectionArg("../blog/posts/life/", undefined)).toEqual({
			section: "life",
		})
	})

	it("prefers the flag over the folder's name", () => {
		expect(resolveSectionArg("../blog/posts/tech", "life")).toEqual({
			section: "life",
		})
	})

	it("returns a problem for a folder not named after a section", () => {
		expect(resolveSectionArg("../blog/export", undefined)).toEqual({
			problem:
				'"export" is not a valid section. Use --section=<value> or point at a folder named after one.',
		})
	})

	it("returns a problem for an invalid flag, even in a section-named folder", () => {
		expect(resolveSectionArg("../blog/posts/tech", "Tech")).toHaveProperty(
			"problem"
		)
	})

	it("returns a problem for an empty flag rather than falling back to the folder", () => {
		// `--section=` with no value is a mistake, not "use the default".
		expect(resolveSectionArg("../blog/posts/tech", "")).toEqual({
			problem:
				'"" is not a valid section. Use --section=<value> or point at a folder named after one.',
		})
	})
})
