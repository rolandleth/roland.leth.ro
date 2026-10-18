import { z } from "zod"
import {
	PlatformBucket,
	PlatformTag,
	ProjectPageLayout,
	ProjectProminence,
	ProjectSectionKind,
	ProjectSectionLayout,
	ProjectStatus,
} from "@/generated/prisma/enums"
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
import { BILLING_PERIOD_PATTERN } from "@/lib/utils/productPage"

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
const PROJECT_SECTION_LAYOUTS = Object.values(ProjectSectionLayout) as [
	ProjectSectionLayout,
	...ProjectSectionLayout[],
]
const PROJECT_PROMINENCES = Object.values(ProjectProminence) as [
	ProjectProminence,
	...ProjectProminence[],
]
const PROJECT_PAGE_LAYOUTS = Object.values(ProjectPageLayout) as [
	ProjectPageLayout,
	...ProjectPageLayout[],
]
const PROJECT_STATUSES = Object.values(ProjectStatus) as [
	ProjectStatus,
	...ProjectStatus[],
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
export const projectOfferSchema = z.object({
	name: z.string().min(1).max(60),
	// A plain decimal price string: "0" (free), "4.99", "249.00". Constrained to
	// digits + optional 1-2 decimals so `Number(price)` (used to sort low/high)
	// can't yield NaN and the JSON-LD always carries a valid `price`.
	price: z.string().regex(/^\d+(\.\d{1,2})?$/, {
		message: "Price must be a decimal like 0, 4.99, or 249.00",
	}),
	// Three capital letters, the shape `Intl.NumberFormat` needs: anything else
	// ("US$", "usd ") makes `formatPrice` throw during the render, which takes
	// the whole product page down. Capitals because the JSON-LD carries it too.
	priceCurrency: z.string().regex(/^[A-Z]{3}$/, {
		message: "Currency must be a 3-letter ISO code in capitals, like USD",
	}),
	billingPeriod: z
		.string()
		.regex(BILLING_PERIOD_PATTERN, {
			message:
				"Billing period must be one count and one unit, like P1M, P3M or P1Y; leave it out for a one-time price",
		})
		.optional(),
	// The plan this price belongs to, by its `name`. The product page prints a
	// plan's prices inside its card; `refineProjectPlans` rejects a name no plan
	// has. The JSON-LD ignores it.
	plan: z.string().trim().min(1).max(60).optional(),
	// A short line printed with the price on the product page, e.g. "14-day
	// free trial". The JSON-LD ignores it.
	note: z.string().trim().min(1).max(80).optional(),
	// The price the product page marks "Best value". `refineBestValueOffer`
	// keeps it to one paid price that has another paid price in its plan to
	// beat. The JSON-LD ignores it.
	isBestValue: z.boolean().optional(),
	sortOrder: z.number().int().min(0).optional(),
})

/** The `offers` Json column, as written and as read back (`getProjectBySlug`). */
export const projectOffersSchema = z.array(projectOfferSchema)

// One plan card on the product page: what the plan includes, with its prices
// pulled from the offers that name it. Stored in the `plans` Json column, like
// `offers`.
export const projectPlanSchema = z.object({
	name: z.string().trim().min(1).max(60),
	isHighlighted: z.boolean().optional(),
	features: z.array(z.string().trim().min(1).max(160)).min(1).max(12),
	sortOrder: z.number().int().min(0).optional(),
})

/** The `plans` Json column, as written and as read back (`getProjectBySlug`). */
export const projectPlansSchema = z.array(projectPlanSchema).max(4)

const projectFaqSchema = z.object({
	question: z.string().min(1).max(300),
	// Markdown, rendered on read like section descriptions — same generous cap.
	answer: z.string().min(1).max(100_000),
	sortOrder: z.number().int().min(0).optional(),
})

/**
 * The longest caption or alt text an image may have: a section image's, and
 * the product page's hero image alt. The admin inputs take their `maxLength`
 * from here.
 */
export const IMAGE_TEXT_MAX_CHARS = 300

const projectSectionImageSchema = z.object({
	url: httpUrl,
	caption: z.string().max(IMAGE_TEXT_MAX_CHARS).nullable().optional(),
	alt: z.string().max(IMAGE_TEXT_MAX_CHARS).nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
})

const sectionMarkdown = z.string().min(1).max(100_000)
// The intro of a steps section and the note of a pricing section. "" means
// none: the admin form sends it for an empty editor.
const optionalSectionMarkdown = z.string().max(100_000).optional()

const projectSectionItemSchema = z.object({
	title: z.string().trim().min(1).max(200),
	description: sectionMarkdown,
	sortOrder: z.number().int().min(0).optional(),
	images: z.array(projectSectionImageSchema).optional(),
})

// A field a kind doesn't take is rejected with a message rather than stripped
// like an unknown key, so a manifest can't drop its images without saying so.
// An empty array passes: the admin form sends one for every section. `never`
// rather than `unknown` keeps the parsed type an empty image list, so code that
// walks every section's images (`forEachSectionImage`) takes any kind.
function unusedList(message: string) {
	return z.array(z.never({ error: message })).optional()
}

const sectionFields = {
	title: z.string().min(1).max(200),
	sortOrder: z.number().int().min(0).optional(),
}

// What a section holds on the own-app product page (see `ProjectSectionKind`
// in the Prisma schema). The tabbed layout reads every kind as plain text.
const projectSectionSchema = z.discriminatedUnion("kind", [
	z.object({
		...sectionFields,
		kind: z.literal(ProjectSectionKind.text),
		layout: z.enum(PROJECT_SECTION_LAYOUTS),
		description: sectionMarkdown,
		images: z.array(projectSectionImageSchema).optional(),
		items: unusedList("A text section has no items"),
	}),
	z.object({
		...sectionFields,
		kind: z.literal(ProjectSectionKind.steps),
		// An optional intro above the steps.
		description: optionalSectionMarkdown,
		images: unusedList(
			"A steps section has no images of its own; put them on its steps"
		),
		items: z.array(projectSectionItemSchema).min(2).max(10),
	}),
	z.object({
		...sectionFields,
		kind: z.literal(ProjectSectionKind.pricing),
		// An optional note under the plan cards.
		description: optionalSectionMarkdown,
		images: unusedList("A pricing section has no images"),
		items: unusedList("A pricing section has no items"),
	}),
])

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
export const paletteThemeSchema = z.object({
	band: hexColor,
	bandInk: hexColor,
	bandInk2: hexColor,
	bandHighlight: hexColor,
	accentText: hexColor,
})

// Both themes are required: a band designed for one background has no safe
// default on the other (a cream band is a glaring block on a dark page). Also
// what `getProjectBySlug` parses the column with on read.
export const projectPaletteSchema = z.object({
	light: paletteThemeSchema,
	dark: paletteThemeSchema,
})

/**
 * The longest each product-page text field may be. The admin form's inputs
 * take their `maxLength` from here, so the two can't drift.
 */
export const PRODUCT_PAGE_TEXT_LIMITS = {
	metaDescription: DESCRIPTION_MAX_CHARS,
	heroEyebrow: 80,
	heroHeadline: 80,
	heroImageAlt: IMAGE_TEXT_MAX_CHARS,
	storeNote: 120,
	closingHeadline: 80,
	closingBody: 200,
	disclaimer: 300,
} as const

/** The product page's plain-text columns, one per `PRODUCT_PAGE_TEXT_LIMITS` key. */
export type ProductPageTextKey = keyof typeof PRODUCT_PAGE_TEXT_LIMITS

/** The product-page text field keys, in the order above. */
export const PRODUCT_PAGE_TEXT_KEYS = Object.keys(
	PRODUCT_PAGE_TEXT_LIMITS
) as ProductPageTextKey[]

/** Trimmed, not blank, capped; null clears it, absent leaves it. */
function optionalTrimmedText(maxLength: number) {
	return z.string().trim().min(1).max(maxLength).nullable().optional()
}

// Rendered only by the product layout, apart from `metaDescription`, which
// sets every project's search snippet (see the Prisma schema). `satisfies`
// fails the build when a key here and a limit above don't pair up.
const productPageTextFields = {
	metaDescription: collapsedWhitespace
		.pipe(z.string().min(1).max(PRODUCT_PAGE_TEXT_LIMITS.metaDescription))
		.nullable()
		.optional(),
	heroEyebrow: optionalTrimmedText(PRODUCT_PAGE_TEXT_LIMITS.heroEyebrow),
	heroHeadline: optionalTrimmedText(PRODUCT_PAGE_TEXT_LIMITS.heroHeadline),
	heroImageAlt: optionalTrimmedText(PRODUCT_PAGE_TEXT_LIMITS.heroImageAlt),
	storeNote: optionalTrimmedText(PRODUCT_PAGE_TEXT_LIMITS.storeNote),
	closingHeadline: optionalTrimmedText(
		PRODUCT_PAGE_TEXT_LIMITS.closingHeadline
	),
	closingBody: optionalTrimmedText(PRODUCT_PAGE_TEXT_LIMITS.closingBody),
	disclaimer: optionalTrimmedText(PRODUCT_PAGE_TEXT_LIMITS.disclaimer),
} satisfies Record<ProductPageTextKey, z.ZodType>

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
	// The three Json columns are nullable like the text ones, so a PUT can clear
	// them; the route writes a null as SQL NULL (`toJsonColumnUpdate`).
	offers: projectOffersSchema.nullable().optional(),
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
	prominence: z.enum(PROJECT_PROMINENCES).optional(),
	pageLayout: z.enum(PROJECT_PAGE_LAYOUTS).optional(),
	status: z.enum(PROJECT_STATUSES).optional(),
	isOwnApp: z.boolean().optional(),
	...productPageTextFields,
	plans: projectPlansSchema.nullable().optional(),
	palette: projectPaletteSchema.nullable().optional(),
	date: z.string().nullable().optional(),
	sortOrder: z.number().int().min(0).optional(),
	sections: z.array(projectSectionSchema).optional(),
	links: z.array(projectLinkSchema).optional(),
	faqs: z.array(projectFaqSchema).optional(),
}

type PlanRefineInput = {
	pageLayout?: ProjectPageLayout
	plans?: { name: string; isHighlighted?: boolean }[] | null
	offers?: { plan?: string; price: string; isBestValue?: boolean }[] | null
	sections?: { kind: ProjectSectionKind }[]
}

// Cross-field rules for the plan cards:
//   - a partial update sends `plans` and `offers` together, or neither;
//   - plan names are unique, since offers point at a plan by name;
//   - at most one plan is highlighted (it's the one on the band colour);
//   - with plans present, every offer names one of them, or that price would
//     print in no card;
//   - an offer that names a plan needs plans to exist;
//   - a project with the product page and offers has plans, since the product
//     page prints prices only inside plan cards;
//   - at most one `pricing` section, and only on a project with offers, or it
//     would be a heading over nothing;
//   - at most one best-value price, paid, with another paid price in its plan.
// Like `refineBucketTagCoherence`, each rule only fires when the fields it
// compares are in the payload. A field that is absent is left as stored; a
// null one, like an absent one on the create path, means none.
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

	// The schema can't see the stored row. Plans sent alone could rename the
	// plan the stored offers name; offers sent alone could name a plan that was
	// never stored. Either way the prices drop out of every card with no error
	// (`groupOffersByPlan`), so a partial update must carry both to be checked.
	if (isPartial && (plans === undefined) !== (offers === undefined)) {
		ctx.addIssue({
			code: "custom",
			path: [plans === undefined ? "plans" : "offers"],
			message:
				"Send plans and offers together: each offer names its plan, so neither can be checked alone",
		})

		return
	}

	refineProductPagePlans(value, ctx)
	refinePricingSections(sections, offers, ctx, isPartial)
	refineBestValueOffer(offers, ctx)

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

			if (!planNames.has(offer.plan)) {
				ctx.addIssue({
					code: "custom",
					path: ["offers", index, "plan"],
					message: `No plan is named "${offer.plan}"`,
				})
			}
		})
	}
}

// Keyed to the page, not to ownership: it's the product page that prints
// prices only inside plan cards. Offers in a partial update come with their
// plans (see above), so a missing `plans` here always means none.
function refineProductPagePlans(
	value: PlanRefineInput,
	ctx: z.RefinementCtx
): void {
	const { pageLayout, plans, offers } = value

	if (
		pageLayout !== ProjectPageLayout.product ||
		offers == null ||
		offers.length === 0
	) {
		return
	}

	if (plans == null || plans.length === 0) {
		ctx.addIssue({
			code: "custom",
			path: ["plans"],
			message:
				"A product page with offers needs plans: it prints prices inside plan cards",
		})
	}
}

function refinePricingSections(
	sections: PlanRefineInput["sections"],
	offers: PlanRefineInput["offers"],
	ctx: z.RefinementCtx,
	isPartial: boolean
): void {
	if (sections == null) {
		return
	}

	const pricingCount = sections.filter(
		(section) => section.kind === ProjectSectionKind.pricing
	).length

	if (pricingCount > 1) {
		ctx.addIssue({
			code: "custom",
			path: ["sections"],
			message: "At most one section can be a pricing section",
		})
	}

	// A partial update that leaves `offers` out isn't saying there are none; one
	// that sends null is.
	if (offers === undefined && isPartial) {
		return
	}

	if (pricingCount > 0 && (offers == null || offers.length === 0)) {
		ctx.addIssue({
			code: "custom",
			path: ["sections"],
			message: "A pricing section needs the project to have offers",
		})
	}
}

// "Best value" is a comparison, so the flagged price needs something to beat:
// another paid price in the same plan, or among the offers when none names a
// plan. A free price is never it. Offers alone decide this, so a partial
// update that sends them can be checked whole.
function refineBestValueOffer(
	offers: PlanRefineInput["offers"],
	ctx: z.RefinementCtx
): void {
	if (offers == null) {
		return
	}

	const flagged = offers.filter((offer) => offer.isBestValue === true)

	if (flagged.length > 1) {
		ctx.addIssue({
			code: "custom",
			path: ["offers"],
			message: "At most one offer can be the best value",
		})
	}

	offers.forEach((offer, index) => {
		if (offer.isBestValue !== true) {
			return
		}

		if (!isPaidPrice(offer.price)) {
			ctx.addIssue({
				code: "custom",
				path: ["offers", index, "isBestValue"],
				message: "A free price can't be the best value",
			})

			return
		}

		const hasRival = offers.some(
			(other) =>
				other !== offer && other.plan === offer.plan && isPaidPrice(other.price)
		)

		if (!hasRival) {
			ctx.addIssue({
				code: "custom",
				path: ["offers", index, "isBestValue"],
				message:
					"A best-value price needs another paid price in its plan to compare against",
			})
		}
	})
}

function isPaidPrice(price: string): boolean {
	return Number(price) > 0
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
