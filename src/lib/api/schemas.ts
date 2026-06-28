import { z } from "zod"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { SECTIONS } from "@/lib/db/sections"
import { createSlug } from "@/lib/utils/format"
import { BUCKET_SUGGESTED_TAGS } from "@/lib/utils/platforms"

// `z.enum` in Zod 4 wants a const string tuple, but Prisma generates each
// enum as a runtime object whose values are strings. Casting through the
// "first, ...rest" tuple shape is the cheapest bridge that keeps the
// resulting schema type-narrowed to the enum's union.
const PLATFORM_BUCKETS = Object.values(PlatformBucket) as [
	PlatformBucket,
	...PlatformBucket[],
]
const PLATFORM_TAGS = Object.values(PlatformTag) as [
	PlatformTag,
	...PlatformTag[],
]

// Frozen Set per bucket so the coherence superRefine doesn't rebuild on every
// parse. Mirrors what the picker offers — OpenSource is unconstrained by
// design (an OSS project can carry any platform tag), iOS/Mac/Web are scoped
// to their natural sets.
const BUCKET_SUGGESTED_SETS: Record<
	PlatformBucket,
	ReadonlySet<PlatformTag>
> = {
	iOS: new Set(BUCKET_SUGGESTED_TAGS.iOS),
	Mac: new Set(BUCKET_SUGGESTED_TAGS.Mac),
	Web: new Set(BUCKET_SUGGESTED_TAGS.Web),
	OpenSource: new Set(BUCKET_SUGGESTED_TAGS.OpenSource),
}

// Rejects titles/names that pass `min(1)` but `createSlug` reduces to "" (all
// punctuation, soft hyphens, U+2212 minus runs). Without this gate, the DB
// insert blows up with a unique-constraint or empty-slug error far from the
// admin form, surfacing as a 409/500 that hides the real cause.
function producesNonEmptySlug(value: string): boolean {
	return createSlug(value) !== ""
}
const SLUG_EMPTY_MESSAGE =
	"Must produce a non-empty slug (try fewer punctuation marks)"

// Only http/https allowed — prevents javascript: or data: XSS vectors.
// Add rel="noopener noreferrer" to any <a> rendering these on public pages.
const httpUrl = z
	.string()
	.url()
	.refine((u) => /^https?:/.test(u), {
		message: "URL must use http or https",
	})

// Posts

// `yyyy-MM-dd-HHmm` — same shape as `currentDatetimeString()` and consumed by
// `postDatetimeToISO`, which returns `undefined` on bad input (callers omit
// the dependent attribute or fall back). Validating here keeps malformed
// `datetime` out of the DB on writes; the regex is the load-bearing gate.
const postDatetime = z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{4}$/, {
	message: "datetime must be `yyyy-MM-dd-HHmm`",
})

export const postCreateSchema = z.object({
	title: z
		.string()
		.min(1)
		.max(200)
		.refine(producesNonEmptySlug, { message: SLUG_EMPTY_MESSAGE }),
	body: z.string().min(1).max(100_000),
	datetime: postDatetime,
	summary: z.string().max(160).nullable().optional(),
	imageUrl: httpUrl.nullable().optional(),
	section: z.enum(SECTIONS).optional(),
	published: z.boolean().optional(),
})

export const postUpdateSchema = postCreateSchema.partial()

// Per-file payload mirrors the strictest body limit from `postCreateSchema`,
// so a malformed file is rejected at the parser before it ever reaches the
// per-row insert. The 50-file cap keeps a single bulk request bounded
// (50 × 100KB ≈ 5MB worst case) — well under any reasonable runtime body
// limit and short enough that the in-memory pre-query for slug collisions
// stays fast. Exported so the client form can render "first N of M" without
// duplicating the constant and drifting from the server cap.
export const BULK_MAX_FILES = 50
export const postBulkImportSchema = z.object({
	section: z.enum(SECTIONS),
	files: z
		.array(
			z.object({
				filename: z.string().min(1).max(300),
				content: z.string().min(1).max(100_000),
			})
		)
		.min(1)
		.max(BULK_MAX_FILES),
})

// Projects

const projectLinkSchema = z.object({
	label: z.string().min(1).max(60),
	url: httpUrl,
	sortOrder: z.number().int().min(0).optional(),
})

// Render-only pricing for the SoftwareApplication JSON-LD. `priceCurrency` is a
// 3-letter ISO code; `billingPeriod` is an optional ISO-8601 duration (`P1M`,
// `P1Y`) omitted for one-time purchases (e.g. Lifetime). Stored verbatim in the
// `offers` Json column — no mapper, no related table.
const projectOfferSchema = z.object({
	name: z.string().min(1).max(60),
	price: z.string().min(1).max(20),
	priceCurrency: z.string().length(3),
	billingPeriod: z.string().max(10).optional(),
	sortOrder: z.number().int().min(0).optional(),
})

const projectFaqSchema = z.object({
	question: z.string().min(1).max(300),
	// Markdown, rendered on read like section descriptions — same generous cap.
	answer: z.string().min(1).max(100_000),
	sortOrder: z.number().int().min(0).optional(),
})

const projectSectionImageSchema = z.object({
	url: httpUrl,
	caption: z.string().max(300).nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
})

const projectSectionSchema = z.object({
	title: z.string().min(1).max(200),
	description: z.string().min(1).max(100_000),
	sortOrder: z.number().int().min(0).optional(),
	images: z.array(projectSectionImageSchema).optional(),
})

// Accepts CSS hex color in #rgb, #rrggbb, #rgba, or #rrggbbaa form.
// A non-hex value renders a broken accent color on the project page, so
// we reject at the schema boundary rather than ship the raw string.
const hexColor = z
	.string()
	.regex(/^#[0-9a-fA-F]{3,8}$/, {
		message: "Must be a hex color like #rgb or #rrggbb",
	})
	.refine((v) => [4, 5, 7, 9].includes(v.length), {
		message: "Hex color must be 3, 4, 6, or 8 digits after the '#'",
	})

// `min(1)` on tags so a project can't be saved with bucket only and no
// descriptive tags — the detail page needs something to render. `max(8)` is
// arbitrary; mainly a guard against the picker accidentally letting you
// click 19 chips. The dedupe refine guards against `[iOS, iOS]` slipping
// through and tripping `compactLabel`'s 2-tag fallback path.
const platformTagsSchema = z
	.array(z.enum(PLATFORM_TAGS))
	.min(1)
	.max(8)
	.refine((arr) => new Set(arr).size === arr.length, {
		message: "Duplicate tags are not allowed",
	})

// Bucket/tag coherence: the picker only lets you pick tags from
// `BUCKET_SUGGESTED_TAGS[bucket]`, so a non-UI caller (raw API client, future
// script) shouldn't be able to corrupt the invariant `compactLabel` /
// `isCompactLabelRedundant` / `groupByBucket` lean on. OpenSource's suggested
// set is every tag, so OSS combos like `[Library, iOS]` still pass. Runs on
// both create and update; only fires when BOTH fields are present so a PUT
// that omits one field is unaffected.
function refineBucketTagCoherence(
	value: { bucket?: PlatformBucket; platformTags?: PlatformTag[] },
	ctx: z.RefinementCtx
): void {
	if (value.bucket == null || value.platformTags == null) {
		return
	}

	const allowed = BUCKET_SUGGESTED_SETS[value.bucket]
	const invalid = value.platformTags.filter((t) => !allowed.has(t))

	if (invalid.length === 0) {
		return
	}

	ctx.addIssue({
		code: "custom",
		path: ["platformTags"],
		message: `Tags not valid for ${value.bucket} bucket: ${invalid.join(", ")}`,
	})
}

const projectFields = {
	name: z
		.string()
		.min(1)
		.max(80)
		.refine(producesNonEmptySlug, { message: SLUG_EMPTY_MESSAGE }),
	summary: z.string().min(1).max(300),
	// Drives the `<title>` tag instead of the brand-word default (`name`).
	// Capped at 60 so it doesn't truncate in SERPs.
	metaTitle: z.string().max(60).nullable().optional(),
	keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
	offers: z.array(projectOfferSchema).optional(),
	bucket: z.enum(PLATFORM_BUCKETS),
	platformTags: platformTagsSchema,
	role: z.string().max(80).nullable().optional(),
	accentColor: hexColor.nullable().optional(),
	icon: httpUrl.nullable().optional(),
	cardImage: httpUrl.nullable().optional(),
	ogImage: httpUrl.nullable().optional(),
	heroImage: httpUrl.nullable().optional(),
	isFeatured: z.boolean().optional(),
	isDiscontinued: z.boolean().optional(),
	date: z.string().nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	sections: z.array(projectSectionSchema).optional(),
	links: z.array(projectLinkSchema).optional(),
	faqs: z.array(projectFaqSchema).optional(),
}

// `superRefine` is layered on the base object schemas so each surface keeps
// the same `.partial()` behavior — the resulting ZodEffects can't be
// `.partial()`'d further, so we build create/update from the shared field
// map.
export const projectCreateSchema = z
	.object(projectFields)
	.superRefine(refineBucketTagCoherence)

export const projectUpdateSchema = z
	.object(projectFields)
	.partial()
	.superRefine(refineBucketTagCoherence)

// Auth

export const loginSchema = z.object({
	// Trim + lowercase so a typo with mixed casing or trailing whitespace
	// matches the case-sensitive `email === ` check inside `verifyCredentials`.
	email: z
		.string()
		.email()
		.transform((v) => v.trim().toLowerCase()),
	password: z.string().min(1),
})
