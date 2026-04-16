import type { PostListItem } from "@/lib/posts"
import type { ProjectListItem } from "@/lib/projects"

export const TEST_SECRET = "abc123"

export function makePost(overrides: Partial<PostListItem> = {}): PostListItem {
	return {
		id: 1,
		title: "Default Title",
		body: "Default body content.",
		datetime: "2024-06-01-1200",
		slug: "default-title",
		section: "tech",
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
		platform: "iOS",
		isFeatured: false,
		isDiscontinued: false,
		sortOrder: 0,
		icon: null,
		...overrides,
	}
}
