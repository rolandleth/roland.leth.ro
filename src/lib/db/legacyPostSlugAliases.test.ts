import { describe, expect, it } from "vitest"
import { createSlug } from "@/lib/utils/format"
import {
	LEGACY_POST_SLUG_ALIASES,
	resolveLegacyPostAlias,
} from "./legacyPostSlugAliases"

describe("resolveLegacyPostAlias", () => {
	it("resolves a known legacy slug to its canonical section + slug", () => {
		expect(resolveLegacyPostAlias("final-version--for-now-")).toEqual({
			section: "tech",
			slug: "final-version-for-now",
		})
	})

	it("resolves a life-section alias", () => {
		expect(
			resolveLegacyPostAlias("intro--slightly-more-details-about-me")
		).toEqual({
			section: "life",
			slug: "intro-slightly-more-details-about-me",
		})
	})

	it("returns null for a slug that isn't aliased", () => {
		expect(resolveLegacyPostAlias("some-normal-slug")).toBeNull()
	})
})

describe("LEGACY_POST_SLUG_ALIASES integrity", () => {
	it("every target slug is what createSlug would produce (i.e. already clean)", () => {
		// Guards against an alias pointing at a slug that isn't canonical — the
		// target must equal `createSlug(target)`, or the redirect lands on a URL
		// that would itself get cleaned/redirected.
		for (const { slug } of Object.values(LEGACY_POST_SLUG_ALIASES)) {
			expect(createSlug(slug)).toBe(slug)
		}
	})

	it("no legacy (ugly) key already equals its canonical target", () => {
		// Every entry must represent a real rename; a key that already matched its
		// target would be a dead entry.
		for (const [legacy, { slug }] of Object.entries(LEGACY_POST_SLUG_ALIASES)) {
			expect(legacy).not.toBe(slug)
		}
	})
})
