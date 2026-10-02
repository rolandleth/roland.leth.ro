import { describe, expect, it } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	guideCreateSchema,
	guideTopicCreateSchema,
	guideTopicUpdateSchema,
	guideUpdateSchema,
	loginSchema,
	postCreateSchema,
	postFileSchema,
	postUpdateSchema,
	projectCreateSchema,
	projectUpdateSchema,
} from "@/lib/api/schemas"
import { DESCRIPTION_MAX_CHARS } from "@/lib/content/descriptionRules"
import { deriveDescription } from "@/lib/content/markdown"
import { createSlug } from "@/lib/utils/format"

// #region httpUrl (tested indirectly through schema fields that use it)

describe("httpUrl validator (via imageUrl)", () => {
	const base = {
		title: "T",
		slug: "t",
		body: "B",
		datetime: "2025-01-01-1200",
	}

	it("accepts http:// URLs", () => {
		const result = postCreateSchema.safeParse({
			...base,
			imageUrl: "http://example.com/img.png",
		})
		expect(result.success).toBe(true)
	})

	it("accepts https:// URLs", () => {
		const result = postCreateSchema.safeParse({
			...base,
			imageUrl: "https://example.com/img.png",
		})
		expect(result.success).toBe(true)
	})

	it.each([
		["javascript: URLs", "javascript:alert(1)"],
		["data: URLs", "data:text/html,<h1>hi</h1>"],
		// eslint-disable-next-line sonarjs/no-clear-text-protocols -- rejecting ftp:// is the behavior under test, not a real request.
		["ftp:// URLs", "ftp://files.example.com/file.txt"],
		["a plain string with no protocol", "example.com/img.png"],
	])("rejects %s", (_label, imageUrl) => {
		const result = postCreateSchema.safeParse({ ...base, imageUrl })
		expect(result.success).toBe(false)
	})
})

// #endregion

// #region postCreateSchema

describe("postCreateSchema", () => {
	const valid = {
		title: "My Post",
		slug: "my-post",
		body: "Some content here.",
		datetime: "2025-06-01-0900",
	}

	it("accepts a minimal valid payload", () => {
		expect(postCreateSchema.safeParse(valid).success).toBe(true)
	})

	it("accepts a fully-populated payload", () => {
		const result = postCreateSchema.safeParse({
			...valid,
			description: "A short description.",
			imageUrl: "https://example.com/hero.png",
			section: "life",
			published: false,
		})
		expect(result.success).toBe(true)
	})

	it("rejects when title is missing", () => {
		const { title: _, ...rest } = valid
		expect(postCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects when body is missing", () => {
		const { body: _, ...rest } = valid
		expect(postCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects when datetime is missing", () => {
		const { datetime: _, ...rest } = valid
		expect(postCreateSchema.safeParse(rest).success).toBe(false)
	})

	it.each([
		// The regex is format-only (`/^\d{4}-\d{2}-\d{2}-\d{4}$/`), not semantic —
		// out-of-range months or hours are NOT rejected here; the cases below
		// validate that structural mismatches are caught at write time.
		"garbage",
		"2025-01-01",
		"2025-01-01-25:00",
		"2025-1-1-0000",
		"25-01-01-0000",
	])("rejects malformed datetime %s", (datetime) => {
		// postDatetimeToISO returns null on malformed values; the schema catches
		// these at write time so invalid datetimes don't reach the DB at all.
		expect(postCreateSchema.safeParse({ ...valid, datetime }).success).toBe(
			false
		)
	})

	it("rejects an empty title", () => {
		expect(postCreateSchema.safeParse({ ...valid, title: "" }).success).toBe(
			false
		)
	})

	it("rejects a title of only whitespace", () => {
		expect(postCreateSchema.safeParse({ ...valid, title: "   " }).success).toBe(
			false
		)
	})

	it.each([
		// The slug is authored, so a title no longer has to produce one. An
		// all-CJK title used to fail here with a message about punctuation.
		["all punctuation", "!!!???"],
		["CJK", "日本語のタイトル"],
	])("accepts a title that slugs to nothing (%s)", (_label, title) => {
		expect(postCreateSchema.safeParse({ ...valid, title }).success).toBe(true)
	})

	it("rejects when slug is missing", () => {
		const { slug: _, ...rest } = valid
		expect(postCreateSchema.safeParse(rest).success).toBe(false)
	})

	it.each(["My Post", "my--post", "-post", "my_post", "x".repeat(101)])(
		"rejects the non-canonical slug %j instead of rewriting it",
		(slug) => {
			expect(postCreateSchema.safeParse({ ...valid, slug }).success).toBe(false)
		}
	)

	it("rejects an empty body", () => {
		expect(postCreateSchema.safeParse({ ...valid, body: "" }).success).toBe(
			false
		)
	})

	it("rejects an invalid section value", () => {
		expect(
			postCreateSchema.safeParse({ ...valid, section: "food" }).success
		).toBe(false)
	})

	it("accepts imageUrl as null", () => {
		expect(
			postCreateSchema.safeParse({ ...valid, imageUrl: null }).success
		).toBe(true)
	})
})

// #endregion

// #region postUpdateSchema

describe("postUpdateSchema", () => {
	it("accepts an empty object (all fields optional)", () => {
		expect(postUpdateSchema.safeParse({}).success).toBe(true)
	})

	it("accepts a partial update with only title", () => {
		expect(postUpdateSchema.safeParse({ title: "New title" }).success).toBe(
			true
		)
	})

	it("strips a slug, so an update can't move the post's URL", () => {
		const result = postUpdateSchema.safeParse({
			title: "New title",
			slug: "new-title",
		})

		expect(result.success).toBe(true)
		expect(result.data).not.toHaveProperty("slug")
	})

	it("still rejects an invalid imageUrl in a partial update", () => {
		expect(
			postUpdateSchema.safeParse({ imageUrl: "javascript:void(0)" }).success
		).toBe(false)
	})
})

// #endregion

// #region guideCreateSchema

describe("guideCreateSchema", () => {
	const valid = {
		slug: "how-to-keep-a-decision-journal",
		title: "How to keep a decision journal",
		description: "What to write down before an outcome exists, and why.",
		body: "Body markdown.",
	}

	it("accepts a minimal valid guide", () => {
		expect(guideCreateSchema.safeParse(valid).success).toBe(true)
	})

	it("accepts the full optional set", () => {
		const result = guideCreateSchema.safeParse({
			...valid,
			projectSlug: "reckon",
			topicId: 3,
			sortOrder: 2,
			published: false,
		})
		expect(result.success).toBe(true)
	})

	it("requires a slug — it is authored, never derived from the title", () => {
		const { slug, ...withoutSlug } = valid
		expect(slug).toBeDefined()
		expect(guideCreateSchema.safeParse(withoutSlug).success).toBe(false)
	})

	it("requires a description — every guide has a meta/OG/preview surface", () => {
		const { description, ...withoutDescription } = valid
		expect(description).toBeDefined()
		expect(guideCreateSchema.safeParse(withoutDescription).success).toBe(false)
	})

	it("rejects an empty body", () => {
		expect(guideCreateSchema.safeParse({ ...valid, body: "" }).success).toBe(
			false
		)
	})

	it("allows a null projectSlug for a non-product guide", () => {
		const result = guideCreateSchema.safeParse({ ...valid, projectSlug: null })
		expect(result.success).toBe(true)
	})

	it("allows a null topicId for an ungrouped guide", () => {
		const result = guideCreateSchema.safeParse({ ...valid, topicId: null })
		expect(result.success).toBe(true)
	})

	it("rejects a zero or negative topicId", () => {
		expect(guideCreateSchema.safeParse({ ...valid, topicId: 0 }).success).toBe(
			false
		)
		expect(guideCreateSchema.safeParse({ ...valid, topicId: -1 }).success).toBe(
			false
		)
	})

	it("rejects a non-integer sortOrder", () => {
		expect(
			guideCreateSchema.safeParse({ ...valid, sortOrder: 1.5 }).success
		).toBe(false)
	})

	it("rejects a negative sortOrder", () => {
		expect(
			guideCreateSchema.safeParse({ ...valid, sortOrder: -1 }).success
		).toBe(false)
	})

	it("accepts a description at exactly the 160-char SERP cap", () => {
		const result = guideCreateSchema.safeParse({
			...valid,
			description: "d".repeat(160),
		})
		expect(result.success).toBe(true)
	})

	it("rejects a description one char over the cap", () => {
		const result = guideCreateSchema.safeParse({
			...valid,
			description: "d".repeat(161),
		})
		expect(result.success).toBe(false)
	})

	it("rejects a title over 200 chars", () => {
		expect(
			guideCreateSchema.safeParse({ ...valid, title: "t".repeat(201) }).success
		).toBe(false)
	})
})

// #endregion

// #region canonical slug validation

describe("guideCreateSchema — canonical slug form", () => {
	const base = {
		title: "T",
		description: "D",
		body: "B",
	}

	function parseSlug(slug: string) {
		return guideCreateSchema.safeParse({ ...base, slug }).success
	}

	it.each([
		["single word", "guides"],
		["hyphenated words", "how-to-keep-a-decision-journal"],
		["digits", "top-10-mistakes"],
		["all digits", "2026"],
	])("accepts %s", (_label, slug) => {
		expect(parseSlug(slug)).toBe(true)
	})

	it.each([
		["uppercase", "How-To"],
		["a leading hyphen", "-leading"],
		["a trailing hyphen", "trailing-"],
		["a doubled hyphen", "double--hyphen"],
		["spaces", "with spaces"],
		["an underscore", "with_underscore"],
		["a slash", "nested/path"],
		["a dot", "file.md"],
		["an accented letter", "café"],
		["an empty string", ""],
	])("rejects %s", (_label, slug) => {
		expect(parseSlug(slug)).toBe(false)
	})

	it("rejects a slug over 100 chars", () => {
		expect(parseSlug("a".repeat(101))).toBe(false)
	})

	// The validator's contract: it accepts exactly what `createSlug` emits, so a
	// slug that survives normalization is always writable, and one that doesn't
	// is a loud error rather than a silent rewrite.
	it.each([
		"How to keep a decision journal",
		"Do decision journals work?",
		"C++ & Rust: a comparison",
		"Café — naïve résumé",
	])("accepts whatever createSlug emits for %j", (title) => {
		expect(parseSlug(createSlug(title))).toBe(true)
	})

	it("rejects a projectSlug that is not canonical", () => {
		const result = guideCreateSchema.safeParse({
			...base,
			slug: "fine",
			projectSlug: "Not Canonical",
		})
		expect(result.success).toBe(false)
	})
})

// #endregion

// #region guideUpdateSchema

describe("guideUpdateSchema", () => {
	it("accepts an empty object", () => {
		expect(guideUpdateSchema.safeParse({}).success).toBe(true)
	})

	it("accepts a single field", () => {
		expect(guideUpdateSchema.safeParse({ title: "New title" }).success).toBe(
			true
		)
	})

	it("still validates the fields it is given", () => {
		expect(guideUpdateSchema.safeParse({ slug: "Not Canonical" }).success).toBe(
			false
		)
	})
})

// #endregion

// #region guideTopicCreateSchema

describe("guideTopicCreateSchema", () => {
	const valid = {
		slug: "making-better-decisions",
		title: "Making better decisions",
		shortDescription: "A method for judging your own calls honestly.",
		description: "Hub body markdown.",
	}

	it("accepts a minimal valid topic", () => {
		expect(guideTopicCreateSchema.safeParse(valid).success).toBe(true)
	})

	it("accepts a project and publish state", () => {
		const result = guideTopicCreateSchema.safeParse({
			...valid,
			projectSlug: "reckon",
			published: false,
		})
		expect(result.success).toBe(true)
	})

	it("requires a shortDescription — it is the project-page blurb", () => {
		const { shortDescription, ...without } = valid
		expect(shortDescription).toBeDefined()
		expect(guideTopicCreateSchema.safeParse(without).success).toBe(false)
	})

	it("requires a hub body", () => {
		expect(
			guideTopicCreateSchema.safeParse({ ...valid, description: "" }).success
		).toBe(false)
	})

	it("accepts a shortDescription at exactly 300 chars", () => {
		const result = guideTopicCreateSchema.safeParse({
			...valid,
			shortDescription: "s".repeat(300),
		})
		expect(result.success).toBe(true)
	})

	it("rejects a shortDescription one char over", () => {
		const result = guideTopicCreateSchema.safeParse({
			...valid,
			shortDescription: "s".repeat(301),
		})
		expect(result.success).toBe(false)
	})

	it("rejects a non-canonical slug", () => {
		expect(
			guideTopicCreateSchema.safeParse({ ...valid, slug: "Making Better" })
				.success
		).toBe(false)
	})
})

// #endregion

// #region guideTopicUpdateSchema

describe("guideTopicUpdateSchema", () => {
	it("accepts an empty object", () => {
		expect(guideTopicUpdateSchema.safeParse({}).success).toBe(true)
	})

	it("still validates the fields it is given", () => {
		expect(
			guideTopicUpdateSchema.safeParse({ shortDescription: "" }).success
		).toBe(false)
	})
})

// #endregion

// #region projectCreateSchema

describe("projectCreateSchema", () => {
	const valid = {
		name: "My App",
		slug: "my-app",
		summary: "An app that does things.",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}

	it("accepts a minimal valid payload", () => {
		expect(projectCreateSchema.safeParse(valid).success).toBe(true)
	})

	it("takes isOwnApp as an optional boolean and nothing else", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, isOwnApp: true }).success
		).toBe(true)
		expect(
			projectCreateSchema.safeParse({ ...valid, isOwnApp: "yes" }).success
		).toBe(false)
	})

	it("accepts a fully-populated payload with sections and links", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			role: "Developer",
			accentColor: "#6366f1",
			icon: "https://example.com/icon.png",
			heroImage: "https://example.com/hero.png",
			isFeatured: true,
			isDiscontinued: false,
			isOwnApp: true,
			date: "2024",
			sortOrder: 1,
			sections: [
				{
					title: "Overview",
					description: "The main overview section.",
					sortOrder: 0,
					kind: "text",
					layout: "stacked",
					images: [
						{
							url: "https://example.com/screenshot.png",
							caption: "Main screen",
							sortOrder: 0,
						},
					],
				},
			],
			links: [
				{ label: "App Store", url: "https://apps.apple.com/app", sortOrder: 0 },
			],
			faqs: [
				{
					question: "Is it free?",
					answer: "Yes, with **markdown** support.",
					sortOrder: 0,
				},
			],
		})
		expect(result.success).toBe(true)
	})

	it("rejects a FAQ with an empty question", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			faqs: [{ question: "", answer: "An answer." }],
		})
		expect(result.success).toBe(false)
	})

	it("rejects a FAQ with an empty answer", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			faqs: [{ question: "A question?", answer: "" }],
		})
		expect(result.success).toBe(false)
	})

	it("rejects a FAQ question over the 300-char cap", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			faqs: [{ question: "q".repeat(301), answer: "An answer." }],
		})
		expect(result.success).toBe(false)
	})

	it("accepts metaTitle, keywords, and offers", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			metaTitle: "1:1 notes for managers (Mac)",
			keywords: ["1:1 notes app", "manager notes app"],
			offers: [
				{
					name: "Monthly",
					price: "12.00",
					priceCurrency: "USD",
					billingPeriod: "P1M",
					sortOrder: 1,
				},
				{ name: "Lifetime", price: "249.00", priceCurrency: "USD" },
			],
		})
		expect(result.success).toBe(true)
	})

	it("rejects a metaTitle over the 60-char cap", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, metaTitle: "x".repeat(61) })
				.success
		).toBe(false)
	})

	it("rejects more than 10 keywords", () => {
		expect(
			projectCreateSchema.safeParse({
				...valid,
				keywords: Array.from({ length: 11 }, (_, i) => `kw${i}`),
			}).success
		).toBe(false)
	})

	it("rejects an offer with a non-3-letter currency code", () => {
		expect(
			projectCreateSchema.safeParse({
				...valid,
				offers: [{ name: "Monthly", price: "12.00", priceCurrency: "US" }],
			}).success
		).toBe(false)
	})

	it("accepts a free offer (price '0') and a single upfront price", () => {
		expect(
			projectCreateSchema.safeParse({
				...valid,
				offers: [{ name: "Free", price: "0", priceCurrency: "USD" }],
			}).success
		).toBe(true)
		expect(
			projectCreateSchema.safeParse({
				...valid,
				offers: [{ name: "App Store", price: "4.99", priceCurrency: "USD" }],
			}).success
		).toBe(true)
	})

	it("rejects a non-numeric or malformed price string", () => {
		for (const price of ["free", "12.345", "$5", "12,00", ""]) {
			expect(
				projectCreateSchema.safeParse({
					...valid,
					offers: [{ name: "Bad", price, priceCurrency: "USD" }],
				}).success
			).toBe(false)
		}
	})

	it("accepts an applicationCategory and rejects one over the 60-char cap", () => {
		expect(
			projectCreateSchema.safeParse({
				...valid,
				applicationCategory: "BusinessApplication",
			}).success
		).toBe(true)
		expect(
			projectCreateSchema.safeParse({
				...valid,
				applicationCategory: "x".repeat(61),
			}).success
		).toBe(false)
	})

	it("rejects when name is missing", () => {
		const { name: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects a name of only whitespace", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, name: "   " }).success
		).toBe(false)
	})

	it.each([
		// The slug is authored, so a name no longer has to produce one.
		["all punctuation", "!!!???"],
		["CJK", "計算機"],
	])("accepts a name that slugs to nothing (%s)", (_label, name) => {
		expect(projectCreateSchema.safeParse({ ...valid, name }).success).toBe(true)
	})

	it("rejects when slug is missing", () => {
		const { slug: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it.each(["My App", "my--app", "-my-app", "my_app", "x".repeat(101)])(
		"rejects the non-canonical slug %j instead of rewriting it",
		(slug) => {
			expect(projectCreateSchema.safeParse({ ...valid, slug }).success).toBe(
				false
			)
		}
	)

	it("rejects when summary is missing", () => {
		const { summary: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects when bucket is missing", () => {
		const { bucket: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects when platformTags is missing", () => {
		const { platformTags: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects when platformTags is empty (min(1))", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, platformTags: [] }).success
		).toBe(false)
	})

	it("rejects when platformTags exceeds the max(8) cap", () => {
		// Picked nine *distinct* tags so this case fails on the cap, not the
		// duplicate-tag refine. Picker bugs that emit dupes are covered separately.
		expect(
			projectCreateSchema.safeParse({
				...valid,
				platformTags: [
					PlatformTag.iOS,
					PlatformTag.iPad,
					PlatformTag.watchOS,
					PlatformTag.Android,
					PlatformTag.macOS,
					PlatformTag.MenuBar,
					PlatformTag.Frontend,
					PlatformTag.Backend,
					PlatformTag.React,
				],
			}).success
		).toBe(false)
	})

	it("rejects duplicate tags in platformTags", () => {
		// Two iOS entries trip `compactLabel`'s 2-tag fallback path even though
		// they're semantically one tag. Reject at the schema boundary so the
		// admin sees a clean 400 instead of a confused "Multiplatform" label.
		expect(
			projectCreateSchema.safeParse({
				...valid,
				platformTags: [PlatformTag.iOS, PlatformTag.iOS],
			}).success
		).toBe(false)
	})

	it("rejects platformTags that aren't in the bucket's suggested set", () => {
		// `Web` bucket can't carry `iOS` — the picker doesn't offer it, so a
		// raw-API caller sending this combo is corrupting the invariant
		// `compactLabel` / `groupByBucket` lean on.
		expect(
			projectCreateSchema.safeParse({
				...valid,
				bucket: PlatformBucket.Web,
				platformTags: [PlatformTag.iOS],
			}).success
		).toBe(false)
	})

	it("accepts OpenSource with cross-cutting platform tags (OSS suggested = every tag)", () => {
		// `[Library, iOS]` is the canonical OSS-iOS combo — an iOS library. The
		// picker offers every tag on OpenSource by design, and the schema
		// mirrors that.
		expect(
			projectCreateSchema.safeParse({
				...valid,
				bucket: PlatformBucket.OpenSource,
				platformTags: [PlatformTag.Library, PlatformTag.iOS],
			}).success
		).toBe(true)
	})

	it("rejects an unknown bucket value", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, bucket: "Game" }).success
		).toBe(false)
	})

	it("rejects an unknown tag value", () => {
		expect(
			projectCreateSchema.safeParse({
				...valid,
				platformTags: ["Rust"],
			}).success
		).toBe(false)
	})

	it("rejects a link with an invalid URL", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			links: [{ label: "Bad link", url: "not-a-url" }],
		})
		expect(result.success).toBe(false)
	})

	it("rejects a section image with an invalid URL", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			sections: [
				{
					title: "Section",
					description: "Desc",
					kind: "text",
					layout: "stacked",
					images: [{ url: "ftp://bad.example.com/img.png" }],
				},
			],
		})
		expect(result.success).toBe(false)
	})
})

// #endregion

// #region projectUpdateSchema

describe("projectUpdateSchema", () => {
	it("accepts an empty object (all fields optional)", () => {
		expect(projectUpdateSchema.safeParse({}).success).toBe(true)
	})

	it("accepts a partial update with only name", () => {
		expect(projectUpdateSchema.safeParse({ name: "Renamed App" }).success).toBe(
			true
		)
	})

	it("trims the name on update, as on create", () => {
		const result = projectUpdateSchema.safeParse({ name: "  Renamed App  " })

		expect(result.success).toBe(true)
		expect(result.data?.name).toBe("Renamed App")
	})

	it("rejects a whitespace-only name on update", () => {
		expect(projectUpdateSchema.safeParse({ name: "   " }).success).toBe(false)
	})

	it("strips a slug, so an update can't move the project's URL", () => {
		const result = projectUpdateSchema.safeParse({
			name: "Renamed App",
			slug: "renamed-app",
		})

		expect(result.success).toBe(true)
		expect(result.data).not.toHaveProperty("slug")
	})

	it("still rejects an invalid icon URL in a partial update", () => {
		expect(
			projectUpdateSchema.safeParse({ icon: "javascript:evil()" }).success
		).toBe(false)
	})

	it("rejects platformTags: [] on update (inner min(1) carries through .partial())", () => {
		// `.partial()` only wraps each field with `.optional()`; when a value is
		// actually present, the inner `.min(1)` still runs. So an explicit
		// empty array — a "clear all tags" PUT — is rejected the same way it
		// would be on create.
		expect(projectUpdateSchema.safeParse({ platformTags: [] }).success).toBe(
			false
		)
	})

	it("rejects duplicate tags on update", () => {
		expect(
			projectUpdateSchema.safeParse({
				platformTags: [PlatformTag.iOS, PlatformTag.iOS],
			}).success
		).toBe(false)
	})

	it("rejects bucket/tag mismatch on update when both fields are present", () => {
		expect(
			projectUpdateSchema.safeParse({
				bucket: PlatformBucket.iOS,
				platformTags: [PlatformTag.Backend],
			}).success
		).toBe(false)
	})

	it("does not run coherence when only platformTags is present (no bucket to check against)", () => {
		// PUT semantics: changing only tags means the bucket on the existing
		// row stays whatever it was. The schema can't validate coherence
		// without knowing the persisted bucket, so it skips the check rather
		// than guess. The route-level read-modify-write should re-validate if
		// it ever combines partial inputs with persisted state.
		expect(
			projectUpdateSchema.safeParse({
				platformTags: [PlatformTag.iOS],
			}).success
		).toBe(true)
	})

	it("does not run coherence when only bucket is present", () => {
		expect(
			projectUpdateSchema.safeParse({ bucket: PlatformBucket.Web }).success
		).toBe(true)
	})
})

// #endregion

// #region sortOrder boundary — projectCreateSchema

describe("projectCreateSchema — sortOrder boundaries", () => {
	const valid = {
		name: "My App",
		slug: "my-app",
		summary: "An app that does things.",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}

	it("rejects a negative sortOrder", () => {
		// The DB stores `sortOrder` as a dense 0-indexed sequence; a negative
		// value would cause the admin PUT path to shift every row and land the
		// new project at an out-of-range index. `.min(0)` closes the gap at the
		// schema boundary.
		expect(
			projectCreateSchema.safeParse({ ...valid, sortOrder: -1 }).success
		).toBe(false)
	})

	it("accepts a zero sortOrder", () => {
		// 0 is the first valid position — the top of the list.
		expect(
			projectCreateSchema.safeParse({ ...valid, sortOrder: 0 }).success
		).toBe(true)
	})

	it("rejects a non-integer sortOrder", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, sortOrder: 1.5 }).success
		).toBe(false)
	})

	it("rejects NaN as a sortOrder", () => {
		expect(
			projectCreateSchema.safeParse({ ...valid, sortOrder: NaN }).success
		).toBe(false)
	})

	it("accepts a non-integer sortOrder on a link only if integer", () => {
		const result = projectCreateSchema.safeParse({
			...valid,
			links: [{ label: "L", url: "https://example.com", sortOrder: 2.5 }],
		})
		expect(result.success).toBe(false)
	})
})

// #endregion

// #region Description whitespace

describe("postCreateSchema — description whitespace", () => {
	const basePost = {
		title: "T",
		slug: "t",
		body: "B",
		datetime: "2024-01-01-0900",
	}

	function parsedDescription(
		description: string | null
	): string | null | undefined {
		const result = postCreateSchema.safeParse({ ...basePost, description })

		if (!result.success) {
			throw new Error(result.error.message)
		}

		return result.data.description
	}

	it("puts a pasted multi-line description on one line", () => {
		expect(parsedDescription("First line.\nSecond line.\r\n\tThird.")).toBe(
			"First line. Second line. Third."
		)
	})

	it("collapses runs of spaces and trims both ends", () => {
		expect(parsedDescription("  Two   spaces  inside.  ")).toBe(
			"Two spaces inside."
		)
	})

	it("turns a whitespace-only description into an empty one, which the routes derive from", () => {
		expect(parsedDescription(" \n\t ")).toBe("")
	})

	it("measures the 160-char cap after collapsing", () => {
		const collapsesTo160 = `${"x".repeat(80)}\n\n   ${"x".repeat(79)}`

		expect(parsedDescription(collapsesTo160)).toHaveLength(160)
	})

	it.each([
		["a word-boundary cut", "word ".repeat(100)],
		["a hard slice", "a".repeat(400)],
	])("accepts what the derivation produces for %s", (_label, body) => {
		// The schema cap and `deriveDescription` share `DESCRIPTION_MAX_CHARS`; a
		// derived value the schema rejected made the edit form unable to save.
		expect(parsedDescription(deriveDescription(body))).toHaveLength(
			DESCRIPTION_MAX_CHARS
		)
	})

	it("still rejects a description that is over 160 chars once collapsed", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			description: `${"x".repeat(80)}\n${"x".repeat(80)}`,
		})

		expect(result.success).toBe(false)
	})

	it("keeps null, which the routes also derive from", () => {
		expect(parsedDescription(null)).toBeNull()
	})
})

describe("title whitespace", () => {
	function parsedPostTitle(title: string): string {
		const result = postCreateSchema.safeParse({
			title,
			slug: "t",
			body: "B",
			datetime: "2024-01-01-0900",
		})

		if (!result.success) {
			throw new Error(result.error.message)
		}

		return result.data.title
	}

	it("puts a post title with a newline on one line", () => {
		// `buildPostMarkdownFile` writes the title into a frontmatter line, and
		// `parseFrontmatter` reads line by line, so a newline breaks the block.
		expect(parsedPostTitle("A title\nwith a break")).toBe(
			"A title with a break"
		)
	})

	it("trims and collapses a padded post title", () => {
		expect(parsedPostTitle("  Spaced   out  ")).toBe("Spaced out")
	})

	it("measures the 200-char post title cap after collapsing", () => {
		// Exactly the cap once collapsed, 204 raw, so the cap must not see the raw
		// string.
		const collapsesToFit = `${"x".repeat(100)}\n\n   ${"x".repeat(99)}`

		expect(parsedPostTitle(collapsesToFit)).toHaveLength(200)
	})

	it("collapses a guide title too", () => {
		const result = guideCreateSchema.safeParse({
			slug: "a-guide",
			title: "A guide\ntitle",
			description: "A guide description.",
			body: "Body markdown.",
		})

		expect(result.success && result.data.title).toBe("A guide title")
	})

	it("still rejects a whitespace-only post title", () => {
		const result = postCreateSchema.safeParse({
			title: " \n\t ",
			slug: "t",
			body: "B",
			datetime: "2024-01-01-0900",
		})

		expect(result.success).toBe(false)
	})
})

describe("a title that slugs to nothing", () => {
	const base = { body: "B", datetime: "2024-01-01-0900" }
	// `createSlug` keeps only `[a-z0-9-]`, so this empties. No schema derives
	// a slug from the title, so none of them may reject it.
	const title = "日本語のタイトル"

	it("is accepted by postCreateSchema, where the slug is authored", () => {
		const result = postCreateSchema.safeParse({
			...base,
			title,
			slug: "a-japanese-post",
		})

		expect(result.success && result.data.title).toBe(title)
	})

	it("is accepted by postFileSchema, where `slug:` decides", () => {
		const result = postFileSchema.safeParse({ ...base, title })

		expect(result.success && result.data.title).toBe(title)
	})

	it("is accepted by postUpdateSchema, which never touches the slug", () => {
		// The edit form sends the title on every save, so a post with this title
		// would otherwise fail its first edit.
		const result = postUpdateSchema.safeParse({ title })

		expect(result.success && result.data.title).toBe(title)
	})

	it("still rejects an empty title on update", () => {
		expect(postUpdateSchema.safeParse({ title: "  " }).success).toBe(false)
	})

	it("still enforces every other rule on the file path", () => {
		expect(
			postFileSchema.safeParse({ ...base, title: "t".repeat(201) }).success
		).toBe(false)
		expect(postFileSchema.safeParse({ ...base, title: "  " }).success).toBe(
			false
		)
	})
})

describe("update schemas inherit the collapse", () => {
	// The transform reaches `.partial()` through a `ZodPipe` wrapped in
	// `.nullable().optional()`. The admin edit form is the likeliest source of a
	// pasted line break and it goes through these, not the create schemas.
	it("collapses a post description on a partial update", () => {
		const result = postUpdateSchema.safeParse({
			description: "First line.\nSecond line.",
		})

		expect(result.success && result.data.description).toBe(
			"First line. Second line."
		)
	})

	it("collapses a post title on a partial update", () => {
		const result = postUpdateSchema.safeParse({ title: "A title\nbroken" })

		expect(result.success && result.data.title).toBe("A title broken")
	})

	it("collapses a guide description on a partial update", () => {
		const result = guideUpdateSchema.safeParse({
			description: "First line.\nSecond line.",
		})

		expect(result.success && result.data.description).toBe(
			"First line. Second line."
		)
	})

	it("collapses a guide title on a partial update", () => {
		const result = guideUpdateSchema.safeParse({ title: "A guide\ntitle" })

		expect(result.success && result.data.title).toBe("A guide title")
	})
})

describe("guideCreateSchema — description whitespace", () => {
	const baseGuide = {
		slug: "a-guide",
		title: "A guide",
		body: "Body markdown.",
	}

	it("puts a pasted multi-line description on one line", () => {
		const result = guideCreateSchema.safeParse({
			...baseGuide,
			description: "First line.\n\nSecond line.",
		})

		expect(result.success && result.data.description).toBe(
			"First line. Second line."
		)
	})

	it("rejects a whitespace-only description, since a guide's is required", () => {
		const result = guideCreateSchema.safeParse({
			...baseGuide,
			description: " \n ",
		})

		expect(result.success).toBe(false)
	})

	it("measures the 160-char cap after collapsing", () => {
		const result = guideCreateSchema.safeParse({
			...baseGuide,
			description: `${"x".repeat(80)}\n\n${"x".repeat(79)}`,
		})

		expect(result.success && result.data.description).toHaveLength(160)
	})
})

// #endregion

// #region String length boundaries

describe("postCreateSchema — title/body/description max-length boundaries", () => {
	const basePost = {
		title: "T",
		slug: "t",
		body: "B",
		datetime: "2024-01-01-0900",
	}

	it("rejects a title longer than 200 characters", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			title: "x".repeat(201),
		})
		expect(result.success).toBe(false)
	})

	it("rejects a body longer than 100_000 characters", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			body: "x".repeat(100_001),
		})
		expect(result.success).toBe(false)
	})

	it("rejects a description longer than 160 characters", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			description: "x".repeat(161),
		})
		expect(result.success).toBe(false)
	})

	it("accepts title/body/description at exactly the configured max", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			title: "x".repeat(200),
			body: "x".repeat(100_000),
			description: "x".repeat(160),
		})
		expect(result.success).toBe(true)
	})
})

describe("projectCreateSchema — name/summary max-length boundaries", () => {
	const baseProject = {
		name: "N",
		slug: "n",
		summary: "S",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}

	it("rejects a name longer than 80 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			name: "x".repeat(81),
		})
		expect(result.success).toBe(false)
	})

	it("rejects a summary longer than 300 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			summary: "x".repeat(301),
		})
		expect(result.success).toBe(false)
	})

	it("accepts name/summary at exactly the configured max", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			name: "x".repeat(80),
			summary: "x".repeat(300),
		})
		expect(result.success).toBe(true)
	})
})

describe("projectCreateSchema — role/accentColor/nested field bounds", () => {
	const baseProject = {
		name: "N",
		slug: "n",
		summary: "S",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}

	it("rejects a role longer than 80 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			role: "x".repeat(81),
		})
		expect(result.success).toBe(false)
	})

	it("accepts a role at exactly 80 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			role: "x".repeat(80),
		})
		expect(result.success).toBe(true)
	})

	it("rejects a link label longer than 60 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			links: [{ label: "x".repeat(61), url: "https://example.com" }],
		})
		expect(result.success).toBe(false)
	})

	it("rejects a section image caption longer than 300 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			sections: [
				{
					title: "S",
					description: "D",
					kind: "text",
					layout: "stacked",
					images: [
						{ url: "https://example.com/i.png", caption: "x".repeat(301) },
					],
				},
			],
		})
		expect(result.success).toBe(false)
	})

	it("rejects a section title longer than 200 characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			sections: [
				{
					title: "x".repeat(201),
					description: "D",
					kind: "text",
					layout: "stacked",
				},
			],
		})
		expect(result.success).toBe(false)
	})
})

describe("projectCreateSchema — accentColor hex validation", () => {
	const baseProject = {
		name: "N",
		slug: "n",
		summary: "S",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}

	it.each([
		["a 3-digit hex color", "#abc"],
		["a 6-digit hex color", "#6366f1"],
		["an 8-digit hex color with alpha", "#6366f1ff"],
	])("accepts %s", (_label, accentColor) => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor,
		})
		expect(result.success).toBe(true)
	})

	it.each([
		// A named color renders without the `#` prefix the project page expects
		// and produces a broken CSS custom property.
		["a named CSS color", "red"],
		["a hex missing the leading '#'", "6366f1"],
		["a 5-digit hex (not a valid CSS form)", "#12345"],
		["a hex with non-hex characters", "#gggggg"],
	])("rejects %s", (_label, accentColor) => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor,
		})
		expect(result.success).toBe(false)
	})

	it("accepts null to clear the accent color", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: null,
		})
		expect(result.success).toBe(true)
	})
})

// #endregion

// #region Product-page fields

describe("projectCreateSchema — product-page fields", () => {
	const base = {
		name: "Digest",
		slug: "digest",
		summary: "A food and symptom journal.",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}
	const theme = {
		band: "#24443a",
		bandInk: "#f4f1e8",
		bandInk2: "#c9d3cc",
		bandHighlight: "#cfa75a",
		accentText: "#2e7d5b",
	}
	const plans = [
		{ name: "Free, forever", features: ["Meals."], sortOrder: 1 },
		{
			name: "Insights",
			isHighlighted: true,
			features: ["Suspects."],
			sortOrder: 2,
		},
	]
	const offers = [
		{ name: "Free", plan: "Free, forever", price: "0", priceCurrency: "USD" },
		{
			name: "Insights, monthly",
			plan: "Insights",
			price: "6.99",
			priceCurrency: "USD",
			billingPeriod: "P1M",
		},
	]

	function issueMessages(input: unknown): string[] {
		const result = projectCreateSchema.safeParse(input)

		return result.success ? [] : result.error.issues.map((i) => i.message)
	}

	it("accepts a full product page: text fields, plans, offers with plans and notes, palette, every section kind", () => {
		const result = projectCreateSchema.safeParse({
			...base,
			isOwnApp: true,
			metaDescription: "Digest is a food and symptom journal for iPhone.",
			heroEyebrow: "Food and symptom journal for iPhone and iPad",
			heroHeadline: "Find which foods to suspect",
			heroImageAlt: "Four cards from Digest.",
			storeNote: "Logging is free, forever.",
			closingHeadline: "10 seconds a meal",
			closingBody: "Three weeks of this is the cheap way to find out.",
			disclaimer: "Digest is not a medical device.",
			plans,
			offers: [offers[0], { ...offers[1], note: "14-day free trial" }],
			palette: { light: theme, dark: theme },
			sections: [
				{
					title: "Guessing cuts too much",
					description: "A guess takes out more than it needs to.",
					kind: "text",
					layout: "stacked",
					images: [
						{
							url: "https://example.com/a.png",
							caption: null,
							alt: "A long description.",
						},
					],
				},
				{
					title: "How it works",
					kind: "steps",
					items: [
						{
							title: "Log a meal in 10 seconds",
							description: "Type it.",
							images: [{ url: "https://example.com/log.png", alt: "Log." }],
						},
						{ title: "Then how you feel", description: "Log it." },
					],
				},
				{
					title: "Test a suspect",
					description: "Stop eating it for a while.",
					kind: "text",
					layout: "split",
				},
				{
					title: "Free and paid",
					description: "Prices are for the US.",
					kind: "pricing",
				},
			],
		})

		expect(result.success).toBe(true)
	})

	it("collapses whitespace in the meta description and caps it at the description limit", () => {
		const collapsed = projectCreateSchema.safeParse({
			...base,
			metaDescription: "Two\nlines.",
		})
		expect(collapsed.success && collapsed.data.metaDescription).toBe(
			"Two lines."
		)

		expect(
			projectCreateSchema.safeParse({
				...base,
				metaDescription: "x".repeat(DESCRIPTION_MAX_CHARS + 1),
			}).success
		).toBe(false)
	})

	it("rejects an empty hero line rather than storing an empty heading part", () => {
		expect(
			projectCreateSchema.safeParse({ ...base, heroEyebrow: "   " }).success
		).toBe(false)
	})

	it("rejects text fields past their limits", () => {
		expect(
			projectCreateSchema.safeParse({ ...base, heroHeadline: "x".repeat(81) })
				.success
		).toBe(false)
		expect(
			projectCreateSchema.safeParse({ ...base, storeNote: "x".repeat(121) })
				.success
		).toBe(false)
		expect(
			projectCreateSchema.safeParse({ ...base, closingBody: "x".repeat(201) })
				.success
		).toBe(false)
	})

	it("rejects two plans with the same name, since offers point at plans by name", () => {
		expect(
			issueMessages({
				...base,
				plans: [plans[0], { ...plans[1], name: "Free, forever" }],
			})
		).toContain("Duplicate plan names: Free, forever")
	})

	it("rejects more than one highlighted plan", () => {
		expect(
			issueMessages({
				...base,
				plans: [{ ...plans[0], isHighlighted: true }, plans[1]],
			})
		).toContain("At most one plan can be highlighted")
	})

	it("rejects a plan with no features", () => {
		expect(
			projectCreateSchema.safeParse({
				...base,
				plans: [{ name: "Free", features: [] }],
			}).success
		).toBe(false)
	})

	it("rejects an offer that names no plan when the project has plans", () => {
		expect(
			issueMessages({
				...base,
				plans,
				offers: [{ name: "Free", price: "0", priceCurrency: "USD" }],
			})
		).toContain("Every offer needs a plan when the project has plans")
	})

	it("rejects an offer that names a plan that doesn't exist", () => {
		expect(
			issueMessages({
				...base,
				plans,
				offers: [{ ...offers[0], plan: "Pro" }],
			})
		).toContain('No plan is named "Pro"')
	})

	it("rejects an offer naming a plan when a create sends no plans at all", () => {
		expect(issueMessages({ ...base, offers })).toEqual(
			expect.arrayContaining(['No plan is named "Free, forever"'])
		)
	})

	it("rejects an own app with offers and no plans, since its prices print only inside plan cards", () => {
		const oneTime = [{ name: "One-time", price: "3.99", priceCurrency: "USD" }]
		const message =
			"An own app with offers needs plans: the product page prints prices inside plan cards"

		expect(
			issueMessages({ ...base, isOwnApp: true, offers: oneTime })
		).toContain(message)
		expect(
			issueMessages({ ...base, isOwnApp: true, offers: oneTime, plans: [] })
		).toContain(message)
	})

	it("accepts offers without plans on a project that isn't an own app", () => {
		// The tabbed layout prints offers on their own; only the product page
		// needs plans.
		expect(
			projectCreateSchema.safeParse({
				...base,
				offers: [{ name: "One-time", price: "3.99", priceCurrency: "USD" }],
			}).success
		).toBe(true)
	})

	it("accepts an own app with no offers and no plans", () => {
		expect(
			projectCreateSchema.safeParse({ ...base, isOwnApp: true }).success
		).toBe(true)
	})

	it("rejects two pricing sections", () => {
		expect(
			issueMessages({
				...base,
				plans,
				offers,
				sections: [
					{ title: "A", kind: "pricing" },
					{ title: "B", kind: "pricing" },
				],
			})
		).toContain("At most one section can be a pricing section")
	})

	it("rejects a pricing section on a project without offers, a heading over nothing", () => {
		expect(
			issueMessages({
				...base,
				sections: [{ title: "Pricing", kind: "pricing" }],
			})
		).toContain("A pricing section needs the project to have offers")
	})

	it("accepts an offer note and rejects an empty or long one", () => {
		const withNote = (note: string) => ({
			...base,
			plans,
			offers: [offers[0], { ...offers[1], note }],
		})

		expect(
			projectCreateSchema.safeParse(withNote("14-day free trial")).success
		).toBe(true)
		expect(projectCreateSchema.safeParse(withNote("  ")).success).toBe(false)
		expect(
			projectCreateSchema.safeParse(withNote("x".repeat(81))).success
		).toBe(false)
	})

	it("rejects a palette value that isn't a hex colour, which would otherwise reach the page's CSS", () => {
		expect(
			projectCreateSchema.safeParse({
				...base,
				palette: {
					light: { ...theme, band: "red;} body{display:none" },
					dark: theme,
				},
			}).success
		).toBe(false)
	})

	it("rejects a palette with only one theme", () => {
		expect(
			projectCreateSchema.safeParse({ ...base, palette: { light: theme } })
				.success
		).toBe(false)
	})
})

describe("projectCreateSchema — section kinds", () => {
	const base = {
		name: "Digest",
		slug: "digest",
		summary: "A food and symptom journal.",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
	}
	const steps = [
		{ title: "Log a meal", description: "Type it." },
		{ title: "Then how you feel", description: "Log it." },
	]

	function parseSections(sections: unknown[]) {
		return projectCreateSchema.safeParse({ ...base, sections })
	}

	function sectionMessages(sections: unknown[]): string[] {
		const result = parseSections(sections)

		return result.success ? [] : result.error.issues.map((i) => i.message)
	}

	it("rejects a section without a kind, so none is taken for granted", () => {
		expect(
			parseSections([{ title: "A", description: "a", layout: "stacked" }])
				.success
		).toBe(false)
	})

	it("rejects a text section without a layout, or with an unknown one", () => {
		expect(
			parseSections([{ title: "A", description: "a", kind: "text" }]).success
		).toBe(false)
		expect(
			parseSections([
				{ title: "A", description: "a", kind: "text", layout: "horizontal" },
			]).success
		).toBe(false)
	})

	it("rejects a text section with an empty body", () => {
		expect(
			parseSections([
				{ title: "A", description: "", kind: "text", layout: "stacked" },
			]).success
		).toBe(false)
	})

	it("rejects steps on a text section", () => {
		expect(
			sectionMessages([
				{
					title: "A",
					description: "a",
					kind: "text",
					layout: "split",
					items: steps,
				},
			])
		).toContain("A text section has no items")
	})

	it("needs 2 to 10 steps in a steps section", () => {
		expect(
			parseSections([{ title: "How", kind: "steps", items: steps.slice(0, 1) }])
				.success
		).toBe(false)
		expect(
			parseSections([{ title: "How", kind: "steps", items: steps }]).success
		).toBe(true)
		expect(
			parseSections([
				{
					title: "How",
					kind: "steps",
					items: Array.from({ length: 11 }, () => steps[0]),
				},
			]).success
		).toBe(false)
	})

	it("rejects a step without a title or a body", () => {
		expect(
			parseSections([
				{
					title: "How",
					kind: "steps",
					items: [{ title: " ", description: "Type it." }, steps[1]],
				},
			]).success
		).toBe(false)
		expect(
			parseSections([
				{
					title: "How",
					kind: "steps",
					items: [{ title: "Log a meal", description: "" }, steps[1]],
				},
			]).success
		).toBe(false)
	})

	it("rejects images on a steps section itself, pointing at its steps", () => {
		expect(
			sectionMessages([
				{
					title: "How",
					kind: "steps",
					items: steps,
					images: [{ url: "https://example.com/a.png" }],
				},
			])
		).toContain(
			"A steps section has no images of its own; put them on its steps"
		)
	})

	it("rejects images and items on a pricing section", () => {
		const pricing = {
			...base,
			isOwnApp: false,
			offers: [{ name: "Once", price: "3.99", priceCurrency: "USD" }],
		}
		const messages = (section: object) => {
			const result = projectCreateSchema.safeParse({
				...pricing,
				sections: [{ title: "Pricing", kind: "pricing", ...section }],
			})

			return result.success ? [] : result.error.issues.map((i) => i.message)
		}

		expect(
			messages({ images: [{ url: "https://example.com/a.png" }] })
		).toContain("A pricing section has no images")
		expect(messages({ items: steps })).toContain(
			"A pricing section has no items"
		)
	})

	it("accepts the empty lists and the empty body the admin form sends", () => {
		// The form sends `images: []` and `items: []` for every section, and ""
		// for an empty intro.
		expect(
			parseSections([
				{
					title: "How",
					description: "",
					kind: "steps",
					images: [],
					items: steps,
				},
				{
					title: "A",
					description: "a",
					kind: "text",
					layout: "stacked",
					items: [],
				},
			]).success
		).toBe(true)
	})
})

describe("projectUpdateSchema — product-page fields", () => {
	it("doesn't require plans of an own app when a partial update leaves them out", () => {
		// The stored plans aren't in the payload; an absent field isn't "none".
		expect(
			projectUpdateSchema.safeParse({
				isOwnApp: true,
				offers: [{ name: "Once", price: "3.99", priceCurrency: "USD" }],
			}).success
		).toBe(true)
	})

	it("still rejects an own app's offers sent with an empty plans list", () => {
		expect(
			projectUpdateSchema.safeParse({
				isOwnApp: true,
				plans: [],
				offers: [{ name: "Once", price: "3.99", priceCurrency: "USD" }],
			}).success
		).toBe(false)
	})

	it("accepts a pricing section when a partial update leaves the offers out", () => {
		expect(
			projectUpdateSchema.safeParse({
				sections: [{ title: "Pricing", kind: "pricing" }],
			}).success
		).toBe(true)
	})

	it("accepts offers that name plans without the plans in the same payload", () => {
		// A partial update can't see the stored plans; judging the offers against
		// an absent field would reject every offers-only PUT.
		expect(
			projectUpdateSchema.safeParse({
				offers: [
					{ name: "Free", plan: "Free", price: "0", priceCurrency: "USD" },
				],
			}).success
		).toBe(true)
	})

	it("still checks offers against plans sent in the same payload", () => {
		const result = projectUpdateSchema.safeParse({
			plans: [{ name: "Free", features: ["Meals."] }],
			offers: [{ name: "Pro", plan: "Pro", price: "9", priceCurrency: "USD" }],
		})
		expect(result.success).toBe(false)
	})
})

// #endregion

// #region loginSchema

describe("loginSchema", () => {
	it("accepts a valid email and password", () => {
		const result = loginSchema.safeParse({
			email: "admin@example.com",
			password: "secret-123",
		})
		expect(result.success).toBe(true)
	})

	it("rejects an invalid email", () => {
		const result = loginSchema.safeParse({
			email: "not-an-email",
			password: "secret-123",
		})
		expect(result.success).toBe(false)
	})

	it("rejects an empty password", () => {
		const result = loginSchema.safeParse({
			email: "admin@example.com",
			password: "",
		})
		expect(result.success).toBe(false)
	})

	it("rejects a missing email field", () => {
		const result = loginSchema.safeParse({ password: "secret-123" })
		expect(result.success).toBe(false)
	})

	it("rejects a missing password field", () => {
		const result = loginSchema.safeParse({ email: "admin@example.com" })
		expect(result.success).toBe(false)
	})

	it("lowercases the email in the parsed output", () => {
		// The transform runs after `.email()` validation and lowercases the value
		// so a mixed-case typo still matches the configured admin address inside
		// verifyCredentials. (Leading/trailing spaces are rejected by `.email()`
		// before the transform runs — strip them client-side before submitting.)
		const result = loginSchema.safeParse({
			email: "ADMIN@Example.COM",
			password: "secret-123",
		})
		expect(result.success).toBe(true)
		expect(result.data?.email).toBe("admin@example.com")
	})
})

// #endregion
