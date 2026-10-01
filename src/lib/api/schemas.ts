import { z } from "zod"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	collapseWhitespace,
	DESCRIPTION_MAX_CHARS,
} from "@/lib/content/descriptionRules"
import { SECTIONS } from "@/lib/db/sections"
import {
	CANONICAL_SLUG_MESSAGE,
	CANONICAL_SLUG_PATTERN,
	SLUG_MAX_LENGTH,
} from "@/lib/utils/format"
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

// Only http/https allowed — prevents javascript: or data: XSS vectors.
// Add rel="noopener noreferrer" to any <a> rendering these on public pages.
const httpUrl = z
	.string()
	.url()
	.refine((u) => /^https?:/.test(u), {
		message: "URL must use http or https",
	})

// Titles and meta descriptions are one line of text. The `.md` exports write
// each into a single frontmatter line, where a raw newline breaks the block, and
// search results and social cards show them on one line anyway. The admin
// description field is a textarea, so a pasted paragraph can carry line breaks:
// they're collapsed here rather than rejected, since an error would only make
// the author retype the same text. Callers pipe the length checks after this, so
// they measure the value that gets stored.
const collapsedWhitespace = z.string().transform(collapseWhitespace)

// Canonical slug form — exactly what `createSlug` emits: lowercase
// alphanumerics joined by single hyphens, no leading or trailing hyphen.
//
// Slugs are validated, never normalized. A slug is authored (a guide's to match
// the search query it targets) and is permanent the moment it's indexed or
// shared — so a malformed one is a loud error, not something to quietly
// rewrite. Silently rewriting the author's chosen slug is exactly how a URL
// moves without anyone noticing.
const canonicalSlug = z
	.string()
	.min(1)
	.max(SLUG_MAX_LENGTH)
	.regex(CANONICAL_SLUG_PATTERN, { message: CANONICAL_SLUG_MESSAGE })

// Posts

// `yyyy-MM-dd-HHmm` — same shape as `currentDatetimeString()` and consumed by
// `postDatetimeToISO`, which returns `undefined` on bad input (callers omit
// the dependent attribute or fall back). Validating here keeps malformed
// `datetime` out of the DB on writes; the regex is the load-bearing gate.
const postDatetime = z.string().regex(/^\d{4}-\d{2}-\d{2}-\d{4}$/, {
	message: "datetime must be `yyyy-MM-dd-HHmm`",
})

// Collapsed for the same reason as the description: `buildPostMarkdownFile`
// writes the title into a frontmatter line that a newline would break, and
// `derivedDescription` falls back to it for a body with no prose.
const postTitle = collapsedWhitespace.pipe(z.string().min(1).max(200))

// Every post write path's rules. No path derives a slug from the title: the
// admin form sends an authored slug on create, and a file carries one in its
// `slug:` line.
const postFields = {
	title: postTitle,
	body: z.string().min(1).max(100_000),
	datetime: postDatetime,
	// The meta description. Optional because the routes derive one from the body
	// when it's absent or blank — whitespace-only included, since it collapses to
	// "". 160 is the SERP truncation point.
	description: collapsedWhitespace
		.pipe(z.string().max(DESCRIPTION_MAX_CHARS))
		.nullable()
		.optional(),
	imageUrl: httpUrl.nullable().optional(),
	section: z.enum(SECTIONS).optional(),
	published: z.boolean().optional(),
}

/**
 * The admin create route's contract. The slug is authored and set once: the
 * form fills it from the title as a suggestion, and the author sees it before
 * the first save. A title with no letters or digits (an all-CJK one, say) is
 * fine, since nothing derives a slug from it.
 */
export const postCreateSchema = z.object({ ...postFields, slug: canonicalSlug })

/**
 * The admin edit route's contract. No `slug` key, so zod strips one if sent:
 * a post's URL never moves after creation.
 */
export const postUpdateSchema = z.object(postFields).partial()

/**
 * The import script's and the admin bulk upload's contract. The slug is not
 * part of it: both read it from the file's `slug:` line, which `resolveSlug`
 * requires before this schema runs.
 */
export const postFileSchema = z.object(postFields)

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

// Guides

// The meta description, the OG description, and the preview text on project and
// topic pages all read this one field, so it's required, not optional. 160 is
// the SERP truncation point (same reasoning as `postCreateSchema.description`).
const guideDescription = collapsedWhitespace.pipe(
	z.string().min(1).max(DESCRIPTION_MAX_CHARS)
)

const guideFields = {
	slug: canonicalSlug,
	// Collapsed for the same reason as the description: `buildGuideMarkdownFile`
	// writes the title into a frontmatter line that a newline would break.
	title: collapsedWhitespace.pipe(z.string().min(1).max(200)),
	description: guideDescription,
	body: z.string().min(1).max(100_000),
	// Slug reference, not an id — see the `projectSlug` note in schema.prisma.
	// Validated for shape here; that it names a real project is checked in the
	// route/import layer, which can hit the DB.
	projectSlug: canonicalSlug.nullable().optional(),
	topicId: z.number().int().positive().nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	published: z.boolean().optional(),
}

export const guideCreateSchema = z.object(guideFields)
export const guideUpdateSchema = z.object(guideFields).partial()

const guideTopicFields = {
	slug: canonicalSlug,
	title: z.string().min(1).max(200),
	// The one-line blurb on a project page. Not a meta description (the hub's
	// own `<meta>` is derived from it but it isn't the only consumer), so it
	// gets project-summary headroom rather than the 160-char SERP cap.
	shortDescription: z.string().min(1).max(300),
	// The hub body — a landing page in markdown, not manifest data.
	description: z.string().min(1).max(100_000),
	projectSlug: canonicalSlug.nullable().optional(),
	published: z.boolean().optional(),
}

export const guideTopicCreateSchema = z.object(guideTopicFields)
export const guideTopicUpdateSchema = z.object(guideTopicFields).partial()

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
	// A plain decimal price string: "0" (free), "4.99", "249.00". Constrained to
	// digits + optional 1-2 decimals so `Number(price)` (used to sort low/high)
	// can't yield NaN and the JSON-LD always carries a valid `price`.
	price: z.string().regex(/^\d+(\.\d{1,2})?$/, {
		message: "Price must be a decimal like 0, 4.99, or 249.00",
	}),
	priceCurrency: z.string().length(3),
	billingPeriod: z.string().max(10).optional(),
	// The plan this price belongs to, by its `name`. The product page prints a
	// plan's prices inside its card; `refineProjectPlans` rejects a name no plan
	// has. The JSON-LD ignores it.
	plan: z.string().trim().min(1).max(60).optional(),
	sortOrder: z.number().int().min(0).optional(),
})

// One plan card on the product page: what the plan includes, with its prices
// pulled from the offers that name it. Stored in the `plans` Json column, like
// `offers`.
const projectPlanSchema = z.object({
	name: z.string().trim().min(1).max(60),
	isHighlighted: z.boolean().optional(),
	features: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
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
	alt: z.string().max(300).nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
})

const projectSectionSchema = z.object({
	title: z.string().min(1).max(200),
	description: z.string().min(1).max(100_000),
	sortOrder: z.number().int().min(0).optional(),
	hasPlans: z.boolean().optional(),
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

// The product page's band and small-text colours for one theme. Hex only: the
// page writes them into a `<style>` block, so the regex is also what keeps
// anything but a colour out of the CSS.
const paletteThemeSchema = z.object({
	band: hexColor,
	bandInk: hexColor,
	bandInk2: hexColor,
	bandHighlight: hexColor,
	accentText: hexColor,
})

// Both themes are required: a band designed for one background has no safe
// default on the other (a cream band is a glaring block on a dark page).
const projectPaletteSchema = z.object({
	light: paletteThemeSchema,
	dark: paletteThemeSchema,
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
	// Trimmed so a name of only spaces still fails `min(1)`, as it did when the
	// name had to produce a non-empty slug.
	name: z.string().trim().min(1).max(80),
	summary: z.string().min(1).max(300),
	// Drives the `<title>` tag instead of the brand-word default (`name`).
	// Capped at 60 so it doesn't truncate in SERPs.
	metaTitle: z.string().max(60).nullable().optional(),
	keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
	offers: z.array(projectOfferSchema).optional(),
	// schema.org SoftwareApplication category, e.g. "BusinessApplication".
	// Omitted from JSON-LD when unset rather than guessed from bucket.
	applicationCategory: z.string().min(1).max(60).nullable().optional(),
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
	isOwnApp: z.boolean().optional(),
	// Product-page fields, rendered only on own apps. See the Prisma schema.
	metaDescription: collapsedWhitespace
		.pipe(z.string().min(1).max(DESCRIPTION_MAX_CHARS))
		.nullable()
		.optional(),
	heroEyebrow: z.string().trim().min(1).max(80).nullable().optional(),
	heroHeadline: z.string().trim().min(1).max(80).nullable().optional(),
	heroImageAlt: z.string().trim().min(1).max(300).nullable().optional(),
	storeNote: z.string().trim().min(1).max(120).nullable().optional(),
	closingHeadline: z.string().trim().min(1).max(80).nullable().optional(),
	closingBody: z.string().trim().min(1).max(200).nullable().optional(),
	disclaimer: z.string().trim().min(1).max(300).nullable().optional(),
	plans: z.array(projectPlanSchema).max(4).optional(),
	palette: projectPaletteSchema.optional(),
	date: z.string().nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	sections: z.array(projectSectionSchema).optional(),
	links: z.array(projectLinkSchema).optional(),
	faqs: z.array(projectFaqSchema).optional(),
}

type PlanRefineInput = {
	plans?: { name: string; isHighlighted?: boolean }[]
	offers?: { plan?: string }[]
	sections?: { hasPlans?: boolean }[]
}

// Cross-field rules for the plan cards:
//   - plan names are unique, since offers point at a plan by name;
//   - at most one plan is highlighted (it's the one on the band colour);
//   - with plans present, every offer names one of them, or that price would
//     print in no card;
//   - an offer that names a plan needs plans to exist;
//   - at most one section holds the cards.
// Like `refineBucketTagCoherence`, each rule only fires when the fields it
// compares are in the payload. The one exception is the create path: there the
// whole project is in the payload, so an offer naming a plan with no `plans`
// sent is a dangling reference, not a field left out.
function projectPlansRefinement(isPartial: boolean) {
	return (value: PlanRefineInput, ctx: z.RefinementCtx) =>
		refineProjectPlans(value, ctx, isPartial)
}

function refineProjectPlans(
	value: PlanRefineInput,
	ctx: z.RefinementCtx,
	isPartial: boolean
): void {
	const { plans, offers, sections } = value

	if (plans != null) {
		const names = plans.map((plan) => plan.name)
		const duplicates = names.filter(
			(name, index) => names.indexOf(name) !== index
		)

		if (duplicates.length > 0) {
			ctx.addIssue({
				code: "custom",
				path: ["plans"],
				message: `Duplicate plan names: ${[...new Set(duplicates)].join(", ")}`,
			})
		}

		if (plans.filter((plan) => plan.isHighlighted === true).length > 1) {
			ctx.addIssue({
				code: "custom",
				path: ["plans"],
				message: "At most one plan can be highlighted",
			})
		}
	}

	if (offers != null) {
		const planNames = new Set((plans ?? []).map((plan) => plan.name))

		offers.forEach((offer, index) => {
			if (offer.plan == null) {
				if (plans != null && plans.length > 0) {
					ctx.addIssue({
						code: "custom",
						path: ["offers", index, "plan"],
						message: "Every offer needs a plan when the project has plans",
					})
				}

				return
			}

			if (plans == null && isPartial) {
				// A partial update may send offers alone; only a payload that sends
				// both can be checked against the plans it names.
				return
			}

			if (!planNames.has(offer.plan)) {
				ctx.addIssue({
					code: "custom",
					path: ["offers", index, "plan"],
					message: `No plan is named "${offer.plan}"`,
				})
			}
		})
	}

	if (
		sections != null &&
		sections.filter((section) => section.hasPlans === true).length > 1
	) {
		ctx.addIssue({
			code: "custom",
			path: ["sections"],
			message: "At most one section can hold the plans",
		})
	}
}

// `superRefine` is layered on the base object schemas so each surface keeps
// the same `.partial()` behavior — the resulting ZodEffects can't be
// `.partial()`'d further, so we build create/update from the shared field
// map.
//
// The slug is authored and set once. Create requires it; update has no `slug`
// key, so zod strips one if sent and the project's URL — and every guide and
// topic that names the project by slug — never moves.
export const projectCreateSchema = z
	.object({ ...projectFields, slug: canonicalSlug })
	.superRefine(refineBucketTagCoherence)
	.superRefine(projectPlansRefinement(false))

export const projectUpdateSchema = z
	.object(projectFields)
	.partial()
	.superRefine(refineBucketTagCoherence)
	.superRefine(projectPlansRefinement(true))

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
