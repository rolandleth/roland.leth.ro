import { describe, expect, it } from "vitest"
import {
	blobKeyFor,
	blobPrefixFor,
	deriveSlug,
	isLocalImageRef,
	listManifestImagePaths,
	type ProjectManifest,
	resolveManifestImageRefs,
	syntheticBlobUrl,
} from "./projectImport"

// #region isLocalImageRef

describe("isLocalImageRef", () => {
	it("treats relative paths as local refs", () => {
		expect(isLocalImageRef("./icon.png")).toBe(true)
		expect(isLocalImageRef("shots/1.png")).toBe(true)
	})

	it("treats absolute http(s) URLs as already-hosted (not local)", () => {
		expect(isLocalImageRef("https://example.com/a.png")).toBe(false)
		expect(isLocalImageRef("http://example.com/a.png")).toBe(false)
		// Case-insensitive so a stray uppercase scheme isn't mistaken for a path.
		expect(isLocalImageRef("HTTPS://example.com/a.png")).toBe(false)
	})

	it("rejects null, undefined, non-strings, and blank strings", () => {
		expect(isLocalImageRef(null)).toBe(false)
		expect(isLocalImageRef(undefined)).toBe(false)
		expect(isLocalImageRef(123)).toBe(false)
		expect(isLocalImageRef("")).toBe(false)
		expect(isLocalImageRef("   ")).toBe(false)
	})
})

// #endregion

// #region deriveSlug

describe("deriveSlug", () => {
	it("derives from the name when no explicit slug is given", () => {
		expect(deriveSlug("Reckon")).toBe("reckon")
		expect(deriveSlug("My Cool App")).toBe("my-cool-app")
	})

	it("prefers an explicit, valid slug over the name", () => {
		expect(deriveSlug("Reckon — Time Tracker", "reckon")).toBe("reckon")
	})

	it("trims surrounding whitespace on an explicit slug", () => {
		expect(deriveSlug("Whatever", "  continuum  ")).toBe("continuum")
	})

	it("throws when an explicit slug isn't a clean slug", () => {
		// Uppercase + space would otherwise reach the DB and surface as an
		// opaque unique-constraint or routing bug far from here.
		expect(() => deriveSlug("Whatever", "Bad Slug")).toThrow(/slug/i)
	})

	it("throws when neither an explicit slug nor the name yields a slug", () => {
		expect(() => deriveSlug("!!!")).toThrow(/slug/i)
		expect(() => deriveSlug("", "")).toThrow(/slug/i)
	})
})

// #endregion

// #region blobKeyFor

describe("blobKeyFor", () => {
	it("namespaces a flat filename under projects/<slug>/", () => {
		expect(blobKeyFor("reckon", "icon.png")).toBe("projects/reckon/icon.png")
	})

	it("preserves subfolders", () => {
		expect(blobKeyFor("reckon", "shots/1.png")).toBe(
			"projects/reckon/shots/1.png"
		)
	})

	it("sanitises segments and drops leading-dot segments", () => {
		expect(blobKeyFor("reckon", "./shots/my shot.png")).toBe(
			"projects/reckon/shots/my-shot.png"
		)
	})

	it("strips traversal segments so the key can't escape the namespace", () => {
		expect(blobKeyFor("reckon", "../../etc/passwd")).toBe(
			"projects/reckon/etc/passwd"
		)
	})

	it("throws when nothing usable remains", () => {
		expect(() => blobKeyFor("reckon", "///")).toThrow(/no usable segments/i)
		expect(() => blobKeyFor("reckon", ".")).toThrow(/no usable segments/i)
	})
})

// #endregion

// #region blobPrefixFor

describe("blobPrefixFor", () => {
	it("returns the project's key prefix with a trailing slash", () => {
		expect(blobPrefixFor("reckon")).toBe("projects/reckon/")
	})

	it("prefixes every key blobKeyFor produces for the same slug", () => {
		const key = blobKeyFor("continuum", "sections/1.png")
		expect(key.startsWith(blobPrefixFor("continuum"))).toBe(true)
	})
})

// #endregion

// #region syntheticBlobUrl

describe("syntheticBlobUrl", () => {
	it("produces a valid https URL embedding the blob key", () => {
		const url = syntheticBlobUrl("reckon", "shots/1.png")
		expect(url).toBe("https://blob.local/projects/reckon/shots/1.png")
		// Must parse as a real URL — it stands in for a hosted image during
		// schema validation, which requires an http(s) URL.
		expect(() => new URL(url)).not.toThrow()
		expect(url.startsWith("https://")).toBe(true)
	})
})

// #endregion

// #region listManifestImagePaths

describe("listManifestImagePaths", () => {
	it("collects icon, hero, and section image local refs in order", () => {
		const manifest: ProjectManifest = {
			name: "Reckon",
			icon: "./icon.png",
			heroImage: "./hero.png",
			sections: [
				{ title: "A", description: "a", images: [{ url: "./a1.png" }] },
				{ title: "B", description: "b", images: [{ url: "./b1.png" }] },
			],
		}
		expect(listManifestImagePaths(manifest)).toEqual([
			"./icon.png",
			"./hero.png",
			"./a1.png",
			"./b1.png",
		])
	})

	it("skips already-hosted URLs and null refs", () => {
		const manifest: ProjectManifest = {
			name: "Reckon",
			icon: "https://cdn.example.com/icon.png",
			heroImage: null,
			sections: [
				{
					title: "A",
					description: "a",
					images: [
						{ url: "./a1.png" },
						{ url: "https://cdn.example.com/a2.png" },
					],
				},
			],
		}
		expect(listManifestImagePaths(manifest)).toEqual(["./a1.png"])
	})

	it("dedupes a file referenced more than once", () => {
		const manifest: ProjectManifest = {
			name: "Reckon",
			icon: "./shared.png",
			sections: [
				{ title: "A", description: "a", images: [{ url: "./shared.png" }] },
			],
		}
		expect(listManifestImagePaths(manifest)).toEqual(["./shared.png"])
	})
})

// #endregion

// #region resolveManifestImageRefs

describe("resolveManifestImageRefs", () => {
	it("replaces local refs while leaving hosted URLs and null untouched", () => {
		const manifest: ProjectManifest = {
			name: "Reckon",
			icon: "./icon.png",
			heroImage: null,
			sections: [
				{
					title: "A",
					description: "a",
					sortOrder: 1,
					images: [
						{ url: "./a1.png", caption: "shot", sortOrder: 2 },
						{ url: "https://cdn.example.com/a2.png" },
					],
				},
			],
		}

		const resolved = resolveManifestImageRefs(
			manifest,
			(path) => `https://blob/${path.replace("./", "")}`
		)

		expect(resolved.icon).toBe("https://blob/icon.png")
		expect(resolved.heroImage).toBeNull()
		expect(resolved.sections?.[0].images?.[0]).toEqual({
			url: "https://blob/a1.png",
			caption: "shot",
			sortOrder: 2,
		})
		// Already-hosted URL passes through verbatim.
		expect(resolved.sections?.[0].images?.[1].url).toBe(
			"https://cdn.example.com/a2.png"
		)
	})

	it("does not mutate the original manifest", () => {
		const manifest: ProjectManifest = {
			name: "Reckon",
			icon: "./icon.png",
			sections: [
				{ title: "A", description: "a", images: [{ url: "./a1.png" }] },
			],
		}

		resolveManifestImageRefs(manifest, () => "https://blob/x.png")

		expect(manifest.icon).toBe("./icon.png")
		expect(manifest.sections?.[0].images?.[0].url).toBe("./a1.png")
	})
})

// #endregion
