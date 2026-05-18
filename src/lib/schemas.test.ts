import { describe, expect, it } from "vitest"
import {
	loginSchema,
	postCreateSchema,
	postUpdateSchema,
	projectCreateSchema,
	projectUpdateSchema,
} from "@/lib/schemas"

// #region httpUrl (tested indirectly through schema fields that use it)

describe("httpUrl validator (via imageUrl)", () => {
	const base = { title: "T", body: "B", datetime: "2025-01-01-1200" }

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

	it("rejects javascript: URLs", () => {
		const result = postCreateSchema.safeParse({
			...base,
			imageUrl: "javascript:alert(1)",
		})
		expect(result.success).toBe(false)
	})

	it("rejects data: URLs", () => {
		const result = postCreateSchema.safeParse({
			...base,
			imageUrl: "data:text/html,<h1>hi</h1>",
		})
		expect(result.success).toBe(false)
	})

	it("rejects ftp:// URLs", () => {
		const result = postCreateSchema.safeParse({
			...base,
			imageUrl: "ftp://files.example.com/file.txt",
		})
		expect(result.success).toBe(false)
	})

	it("rejects a plain string with no protocol", () => {
		const result = postCreateSchema.safeParse({
			...base,
			imageUrl: "example.com/img.png",
		})
		expect(result.success).toBe(false)
	})
})

// #endregion

// #region postCreateSchema

describe("postCreateSchema", () => {
	const valid = {
		title: "My Post",
		body: "Some content here.",
		datetime: "2025-06-01-0900",
	}

	it("accepts a minimal valid payload", () => {
		expect(postCreateSchema.safeParse(valid).success).toBe(true)
	})

	it("accepts a fully-populated payload", () => {
		const result = postCreateSchema.safeParse({
			...valid,
			summary: "A short summary.",
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

	it.each([
		// All-punctuation titles pass `min(1)` but `createSlug` reduces them to
		// "", which would either fail the DB insert (unique-empty-slug) or
		// produce an unreachable post URL. The refine rejects them at the form
		// boundary so the admin sees a clean 400 with a helpful message.
		["all punctuation", "!!!???"],
		["U+2212 minus run", "−−−"],
		// `createSlug` normalises NFKD + strips combining marks; soft hyphens
		// collapse to nothing.
		["soft hyphen run", "­­­"],
		["whitespace only", "   "],
	])("rejects titles that produce an empty slug (%s)", (_label, title) => {
		expect(postCreateSchema.safeParse({ ...valid, title }).success).toBe(false)
	})

	it("accepts a title with punctuation as long as it slugs to something", () => {
		// Mixed punctuation + letters is fine — `createSlug` strips the
		// punctuation but the letters survive.
		expect(
			postCreateSchema.safeParse({ ...valid, title: "!!!Hello???" }).success
		).toBe(true)
	})

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

	it("still rejects an invalid imageUrl in a partial update", () => {
		expect(
			postUpdateSchema.safeParse({ imageUrl: "javascript:void(0)" }).success
		).toBe(false)
	})
})

// #endregion

// #region projectCreateSchema

describe("projectCreateSchema", () => {
	const valid = {
		name: "My App",
		summary: "An app that does things.",
		platform: "iOS",
	}

	it("accepts a minimal valid payload", () => {
		expect(projectCreateSchema.safeParse(valid).success).toBe(true)
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
			date: "2024",
			sortOrder: 1,
			sections: [
				{
					title: "Overview",
					description: "The main overview section.",
					sortOrder: 0,
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
		})
		expect(result.success).toBe(true)
	})

	it("rejects when name is missing", () => {
		const { name: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it.each([
		// Mirrors `postCreateSchema`: names that pass `min(1)` but slug to ""
		// can't produce a valid URL and would surface the failure deep in the
		// DB layer. Reject at the form boundary instead.
		["all punctuation", "!!!???"],
		["U+2212 minus run", "−−−"],
		["soft hyphen run", "­­­"],
		["whitespace only", "   "],
	])("rejects names that produce an empty slug (%s)", (_label, name) => {
		expect(projectCreateSchema.safeParse({ ...valid, name }).success).toBe(
			false
		)
	})

	it("rejects when summary is missing", () => {
		const { summary: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
	})

	it("rejects when platform is missing", () => {
		const { platform: _, ...rest } = valid
		expect(projectCreateSchema.safeParse(rest).success).toBe(false)
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

	it("still rejects an invalid icon URL in a partial update", () => {
		expect(
			projectUpdateSchema.safeParse({ icon: "javascript:evil()" }).success
		).toBe(false)
	})
})

// #endregion

// #region sortOrder boundary — projectCreateSchema

describe("projectCreateSchema — sortOrder boundaries", () => {
	const valid = {
		name: "My App",
		summary: "An app that does things.",
		platform: "iOS",
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

// #region String length boundaries

describe("postCreateSchema — title/body/summary max-length boundaries", () => {
	const basePost = {
		title: "T",
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

	it("rejects a summary longer than 160 characters", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			summary: "x".repeat(161),
		})
		expect(result.success).toBe(false)
	})

	it("accepts title/body/summary at exactly the configured max", () => {
		const result = postCreateSchema.safeParse({
			...basePost,
			title: "x".repeat(200),
			body: "x".repeat(100_000),
			summary: "x".repeat(160),
		})
		expect(result.success).toBe(true)
	})
})

describe("projectCreateSchema — name/summary max-length boundaries", () => {
	const baseProject = {
		name: "N",
		summary: "S",
		platform: "iOS",
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
		summary: "S",
		platform: "iOS",
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
			sections: [{ title: "x".repeat(201), description: "D" }],
		})
		expect(result.success).toBe(false)
	})
})

describe("projectCreateSchema — accentColor hex validation", () => {
	const baseProject = {
		name: "N",
		summary: "S",
		platform: "iOS",
	}

	it("accepts a 3-digit hex color", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "#abc",
		})
		expect(result.success).toBe(true)
	})

	it("accepts a 6-digit hex color", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "#6366f1",
		})
		expect(result.success).toBe(true)
	})

	it("accepts an 8-digit hex color with alpha", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "#6366f1ff",
		})
		expect(result.success).toBe(true)
	})

	it("rejects a named CSS color", () => {
		// A named color renders without the `#` prefix the project page expects
		// and produces a broken CSS custom property.
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "red",
		})
		expect(result.success).toBe(false)
	})

	it("rejects a hex missing the leading '#'", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "6366f1",
		})
		expect(result.success).toBe(false)
	})

	it("rejects a 5-digit hex (not a valid CSS form)", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "#12345",
		})
		expect(result.success).toBe(false)
	})

	it("rejects a hex with non-hex characters", () => {
		const result = projectCreateSchema.safeParse({
			...baseProject,
			accentColor: "#gggggg",
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
