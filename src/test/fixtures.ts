import {
	PlatformBucket,
	PlatformTag,
	ProjectProminence,
	ProjectSectionKind,
	ProjectSectionLayout,
	ProjectStatus,
} from "@/generated/prisma/enums"
import type { ProductPageTextKey } from "@/lib/api/schemas"
import type { GuideListItem, GuideTopicSummary } from "@/lib/db/guides"
import type { PostListItem } from "@/lib/db/posts"
import type {
	ProjectDetail,
	ProjectGalleryItem,
	ProjectListItem,
	ProjectPalette,
	ProjectPaletteTheme,
} from "@/lib/db/projects"

export const TEST_SECRET = "abc123"

/**
 * Every product-page column, empty. Spread into each full project fixture, in
 * the `ProjectDetail` and the Prisma row shapes alike, so a new product-page
 * field means one edit here instead of one per test file. Typed by the
 * schema's key list, so a field added there and not here fails the build.
 */
export const EMPTY_PRODUCT_PAGE_FIELDS = {
	metaDescription: null,
	heroEyebrow: null,
	heroHeadline: null,
	heroImageAlt: null,
	storeNote: null,
	closingHeadline: null,
	closingBody: null,
	disclaimer: null,
	plans: null,
	palette: null,
} satisfies Record<ProductPageTextKey, null> &
	Pick<ProjectDetail, ProductPageTextKey | "plans" | "palette">

/**
 * One palette theme: light ink on a dark green band. Tests that don't care how
 * the two themes differ use it for both.
 */
export const GREEN_BAND_THEME = {
	band: "#24443a",
	bandInk: "#f4f1e8",
	bandInk2: "#c9d3cc",
	bandHighlight: "#cfa75a",
	accentText: "#2e7d5b",
} satisfies ProjectPaletteTheme

/** A palette whose themes differ: a cream band on light, a brown one on dark. */
export const CREAM_PALETTE = {
	light: {
		band: "#f3ede4",
		bandInk: "#2a241e",
		bandInk2: "#6b6158",
		bandHighlight: "#9a532b",
		accentText: "#9a532b",
	},
	dark: {
		band: "#2a211b",
		bandInk: "#f3ede4",
		bandInk2: "#c9bbae",
		bandHighlight: "#e0a27a",
		accentText: "#e0a27a",
	},
} satisfies ProjectPalette

/**
 * The kind fields of a plain section row: a stacked text section with no
 * steps. Spread into every section fixture (the `ProjectDetail`, Prisma row and
 * admin form shapes alike), so a section fixture only spells out its content.
 * A function, so no two fixtures share one `items` array.
 */
export function textSectionFields(): {
	kind: ProjectSectionKind
	layout: ProjectSectionLayout | null
	items: never[]
} {
	return {
		kind: ProjectSectionKind.text,
		layout: ProjectSectionLayout.stacked,
		items: [],
	}
}

/** Fixed so `updatedAt` assertions don't depend on wall-clock time. */
const FIXTURE_DATE = new Date("2026-07-01T12:00:00.000Z")

export function makeGuideListItem(
	overrides: Partial<GuideListItem> = {}
): GuideListItem {
	return {
		id: 1,
		slug: "how-to-keep-a-decision-journal",
		title: "How to keep a decision journal",
		description: "What to write down before an outcome exists, and why.",
		projectSlug: "reckon",
		sortOrder: 0,
		readingTime: "6 min read",
		// Past by default, so a fixture is live unless a test says otherwise.
		publishedAt: FIXTURE_DATE,
		updatedAt: FIXTURE_DATE,
		...overrides,
	}
}

export function makeGuideTopicSummary(
	overrides: Partial<GuideTopicSummary> = {}
): GuideTopicSummary {
	return {
		id: 1,
		slug: "making-better-decisions",
		title: "Making better decisions",
		shortDescription: "A method for judging your own calls honestly.",
		projectSlug: "reckon",
		updatedAt: FIXTURE_DATE,
		...overrides,
	}
}

export function makePost(overrides: Partial<PostListItem> = {}): PostListItem {
	return {
		id: 1,
		title: "Default Title",
		body: "Default body content.",
		datetime: "2024-06-01-1200",
		slug: "default-title",
		section: "tech" as const,
		readingTime: "2 min read",
		...overrides,
	}
}

export function makeProjectListItem(
	overrides: Partial<ProjectListItem> = {}
): ProjectListItem {
	return {
		id: 1,
		name: "My App",
		slug: "my-app",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
		prominence: ProjectProminence.low,
		status: ProjectStatus.live,
		sortOrder: 0,
		icon: null,
		...overrides,
	}
}

export function makeProjectGalleryItem(
	overrides: Partial<ProjectGalleryItem> = {}
): ProjectGalleryItem {
	return {
		...makeProjectListItem(),
		summary: "A project",
		featuredImage: null,
		accentColor: null,
		role: null,
		isOwnApp: false,
		productHeroImage: null,
		heroImageAlt: null,
		heroEyebrow: null,
		heroHeadline: null,
		palette: null,
		links: [],
		...overrides,
	}
}
