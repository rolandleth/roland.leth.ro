import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { listPostsForAdmin, type AdminPostListItem } from "@/lib/db/posts"
import { currentDatetimeString } from "@/lib/utils/format"
import PostsTab from "./PostsTab"

vi.mock("@/lib/db/posts", () => ({
	listPostsForAdmin: vi.fn(),
}))

vi.mock("@/lib/utils/format", async () => {
	const actual =
		await vi.importActual<typeof import("@/lib/utils/format")>(
			"@/lib/utils/format"
		)
	return {
		...actual,
		// Pinned so "future" and "past" fixtures are unambiguous regardless of
		// when the test runs.
		currentDatetimeString: vi.fn().mockReturnValue("2026-05-17-1200"),
	}
})

// Server-component child that calls `useRouter` would crash render; the toggle
// is exercised by its own suite, so stub it out here to keep this test scoped
// to PostsTab's rendering rules.
vi.mock("@/components/admin/BooleanFlagToggle", () => ({
	default: () => null,
}))

function fakePost(overrides: Partial<AdminPostListItem>): AdminPostListItem {
	return {
		id: 1,
		title: "T",
		slug: "t",
		section: "tech",
		datetime: "2026-05-15-0900",
		body: "",
		readingTime: null,
		published: true,
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(currentDatetimeString).mockReturnValue("2026-05-17-1200")
})

describe("PostsTab scheduled marker", () => {
	it("shows `Scheduled` for a published post with a future datetime", async () => {
		vi.mocked(listPostsForAdmin).mockResolvedValue({
			posts: [
				fakePost({
					id: 1,
					title: "Future scheduled",
					datetime: "2099-01-01-0900",
					published: true,
				}),
			],
			totalCount: 1,
			totalPages: 1,
		})

		const ui = await PostsTab({ query: "", page: 1 })
		render(ui)

		expect(screen.getByText(/Scheduled/)).toBeInTheDocument()
		expect(screen.queryByText(/Draft/)).not.toBeInTheDocument()
	})

	it("does NOT show `Scheduled` for a published post with a past datetime", async () => {
		vi.mocked(listPostsForAdmin).mockResolvedValue({
			posts: [
				fakePost({
					id: 2,
					title: "Past published",
					datetime: "2026-05-15-0900",
					published: true,
				}),
			],
			totalCount: 1,
			totalPages: 1,
		})

		const ui = await PostsTab({ query: "", page: 1 })
		render(ui)

		expect(screen.queryByText(/Scheduled/)).not.toBeInTheDocument()
		expect(screen.queryByText(/Draft/)).not.toBeInTheDocument()
	})

	it("shows `Draft` (not `Scheduled`) for an unpublished future-dated post", async () => {
		// Draft wins: a future datetime alone doesn't earn the Scheduled marker;
		// the post must be opted-in to publish for the auto-surface logic to
		// pick it up at the boundary.
		vi.mocked(listPostsForAdmin).mockResolvedValue({
			posts: [
				fakePost({
					id: 3,
					title: "Future draft",
					datetime: "2099-01-01-0900",
					published: false,
				}),
			],
			totalCount: 1,
			totalPages: 1,
		})

		const ui = await PostsTab({ query: "", page: 1 })
		render(ui)

		expect(screen.getByText(/Draft/)).toBeInTheDocument()
		expect(screen.queryByText(/Scheduled/)).not.toBeInTheDocument()
	})

	it("shows `Draft` (not `Scheduled`) for an unpublished past-dated post", async () => {
		vi.mocked(listPostsForAdmin).mockResolvedValue({
			posts: [
				fakePost({
					id: 4,
					title: "Past draft",
					datetime: "2026-05-15-0900",
					published: false,
				}),
			],
			totalCount: 1,
			totalPages: 1,
		})

		const ui = await PostsTab({ query: "", page: 1 })
		render(ui)

		expect(screen.getByText(/Draft/)).toBeInTheDocument()
		expect(screen.queryByText(/Scheduled/)).not.toBeInTheDocument()
	})
})
