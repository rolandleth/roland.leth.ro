import { render, screen, waitFor } from "@testing-library/react"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { setupUser } from "@/test/user"
import BooleanFlagToggle from "./BooleanFlagToggle"

const user = setupUser()

vi.mock("next/navigation", () => ({
	useRouter: vi.fn(),
}))

function mockRouter() {
	const refresh = vi.fn()
	vi.mocked(useRouter).mockReturnValue({ refresh } as unknown as ReturnType<
		typeof useRouter
	>)
	return { refresh }
}

function mockFetchResolved(
	ok: boolean,
	{ status = ok ? 200 : 500, body }: { status?: number; body?: object } = {}
) {
	global.fetch = vi.fn().mockResolvedValue({
		ok,
		status,
		headers: {
			get: (name: string) =>
				name === "content-type" ? "application/json" : null,
		},
		json: () => Promise.resolve(body ?? {}),
	})
}

function mockFetchRejected(reason: unknown) {
	global.fetch = vi.fn().mockRejectedValue(reason)
}

// Convenience wrappers so each test reads at the intent level — "Published
// toggle" / "Featured toggle" — instead of repeating the four props inline.
function renderPublished(
	props: { initial: boolean; postId?: number } = { initial: false }
) {
	const postId = props.postId ?? 1
	return render(
		<BooleanFlagToggle
			initial={props.initial}
			url={`/api/admin/posts/${postId}`}
			payloadKey="published"
			label="Published"
		/>
	)
}

function renderFeatured(
	props: { initial: boolean; projectId?: number } = { initial: false }
) {
	const projectId = props.projectId ?? 1
	return render(
		<BooleanFlagToggle
			initial={props.initial}
			url={`/api/admin/projects/${projectId}`}
			payloadKey="isFeatured"
			label="Featured"
		/>
	)
}

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Rendering

describe("BooleanFlagToggle rendering", () => {
	it("renders the label next to the checkbox so sighted users see what it controls", () => {
		mockRouter()
		renderPublished({ initial: true })
		expect(screen.getByLabelText("Published")).toBeChecked()
	})

	it("reflects the initial value (off)", () => {
		mockRouter()
		renderPublished({ initial: false })
		expect(screen.getByRole("checkbox")).not.toBeChecked()
	})
})

// #endregion

// #region Save behaviour

describe("BooleanFlagToggle save behaviour", () => {
	it("PUTs the new value to the configured URL with the configured payload key", async () => {
		mockRouter()
		mockFetchResolved(true)

		renderPublished({ initial: false, postId: 42 })
		await user.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/posts/42")
		expect(options.method).toBe("PUT")
		expect(JSON.parse(options.body)).toEqual({ published: true })
	})

	it("supports an alternate payload key (isFeatured) without code duplication", async () => {
		mockRouter()
		mockFetchResolved(true)

		renderFeatured({ initial: false, projectId: 7 })
		await user.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/projects/7")
		expect(JSON.parse(options.body)).toEqual({ isFeatured: true })
	})

	it("calls router.refresh on success", async () => {
		const { refresh } = mockRouter()
		mockFetchResolved(true)

		renderPublished({ initial: false })
		await user.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
	})

	it("disables the checkbox while a save is in flight", async () => {
		mockRouter()
		let resolveFetch!: (value: {
			ok: boolean
			status: number
			headers: { get: () => null }
			json: () => Promise<object>
		}) => void
		global.fetch = vi
			.fn()
			.mockImplementation(
				() => new Promise((resolve) => (resolveFetch = resolve))
			)

		renderPublished({ initial: false })
		await user.click(screen.getByRole("checkbox"))

		// While the fetch is pending the user shouldn't be able to click again.
		expect(screen.getByRole("checkbox")).toBeDisabled()

		resolveFetch({
			ok: true,
			status: 200,
			headers: { get: () => null },
			json: () => Promise.resolve({}),
		})

		await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeDisabled())
	})

	it("reverts the checkbox and shows an error on non-ok response", async () => {
		mockRouter()
		mockFetchResolved(false)

		renderPublished({ initial: false })
		await user.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
		)
		expect(screen.getByRole("checkbox")).not.toBeChecked()
	})

	it("reverts to the value at click-time (not the original `initial` prop) after a failed second toggle", async () => {
		// Pins the 2026-05-16 review fix: previously `onRevert` captured the
		// first-render `initial`, so after a successful publish + parent
		// re-render with the new server value, a subsequent failed UNpublish
		// would revert to the stale `initial` (false) instead of the
		// just-committed value (true). With the click-time `prev` capture, the
		// revert must restore the value the user toggled away from.
		mockRouter()
		mockFetchResolved(false)

		// Mount as if the parent has already re-rendered with the new
		// server-confirmed value: `initial=true`.
		const { rerender } = renderPublished({ initial: true })
		expect(screen.getByRole("checkbox")).toBeChecked()

		// Re-render with the same `initial=true` to simulate the post-refresh
		// pass that previously corrupted the revert baseline. (Re-running
		// `useState(initial)` doesn't reset state, but this guards against a
		// future refactor that derives from props.)
		rerender(
			<BooleanFlagToggle
				initial={true}
				url="/api/admin/posts/1"
				payloadKey="published"
				label="Published"
			/>
		)

		await user.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
		)
		// Must revert to TRUE (the value just before this click), not FALSE
		// (the literal first-render `initial`).
		expect(screen.getByRole("checkbox")).toBeChecked()
	})

	it("surfaces the server's error body with the HTTP status suffix on non-ok response", async () => {
		mockRouter()
		mockFetchResolved(false, { status: 409, body: { error: "Slug locked" } })

		renderPublished({ initial: false })
		await user.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText("Slug locked (HTTP 409)")).toBeInTheDocument()
		)
	})

	it("recovers from a thrown fetch rejection without getting stuck saving", async () => {
		mockRouter()
		mockFetchRejected(new Error("Network down"))

		renderPublished({ initial: false })
		await user.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText(/network down/i)).toBeInTheDocument()
		)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).not.toBeChecked()
		expect(checkbox).not.toBeDisabled()
	})

	it("aborts the in-flight request and reverts when toggled a second time before the first resolves", async () => {
		mockRouter()
		let resolveFetch!: (value: { ok: boolean }) => void
		global.fetch = vi
			.fn()
			.mockImplementation(
				() => new Promise((resolve) => (resolveFetch = resolve))
			)

		renderFeatured({ initial: false })
		await user.click(screen.getByRole("checkbox"))
		await user.click(screen.getByRole("checkbox"))

		resolveFetch({ ok: true })

		await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeDisabled())
	})
})

// #endregion
