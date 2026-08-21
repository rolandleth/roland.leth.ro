import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import type { GuideListItem, GuideTopicSummary } from "@/lib/db/guides"
import type { PostListItem } from "@/lib/db/posts"
import type { ProjectGalleryItem, ProjectListItem } from "@/lib/db/projects"

export const TEST_SECRET = "abc123"

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
		isFeatured: false,
		isDiscontinued: false,
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
		...overrides,
	}
}
