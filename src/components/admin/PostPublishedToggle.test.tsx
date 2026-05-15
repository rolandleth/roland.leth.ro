import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRouter } from "next/navigation"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PostPublishedToggle from "./PostPublishedToggle"

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

beforeEach(() => {
	vi.resetAllMocks()
})

// #region Rendering

describe("PostPublishedToggle rendering", () => {
	it("renders a checked checkbox when initially published", () => {
		mockRouter()
		render(<PostPublishedToggle postId={1} initialPublished={true} />)
		expect(screen.getByRole("checkbox")).toBeChecked()
	})

	it("renders an unchecked checkbox when initially a draft", () => {
		mockRouter()
		render(<PostPublishedToggle postId={1} initialPublished={false} />)
		expect(screen.getByRole("checkbox")).not.toBeChecked()
	})
})

// #endregion

// #region Save behaviour

describe("PostPublishedToggle save behaviour", () => {
	it("PUTs the new value to the post API on change", async () => {
		mockRouter()
		mockFetchResolved(true)

		render(<PostPublishedToggle postId={42} initialPublished={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(global.fetch).toHaveBeenCalledOnce())
		const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock
			.calls[0]
		expect(url).toBe("/api/admin/posts/42")
		expect(options.method).toBe("PUT")
		expect(JSON.parse(options.body)).toEqual({ published: true })
	})

	it("calls router.refresh on success", async () => {
		const { refresh } = mockRouter()
		mockFetchResolved(true)

		render(<PostPublishedToggle postId={1} initialPublished={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
	})

	it("reverts the checkbox and shows an error on non-ok response", async () => {
		mockRouter()
		mockFetchResolved(false)

		render(<PostPublishedToggle postId={1} initialPublished={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText(/failed to save/i)).toBeInTheDocument()
		)
		expect(screen.getByRole("checkbox")).not.toBeChecked()
	})

	it("surfaces the server's error body with the HTTP status suffix on non-ok response", async () => {
		mockRouter()
		mockFetchResolved(false, { status: 409, body: { error: "Slug locked" } })

		render(<PostPublishedToggle postId={1} initialPublished={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText("Slug locked (HTTP 409)")).toBeInTheDocument()
		)
	})

	it("recovers from a thrown fetch rejection without getting stuck saving", async () => {
		mockRouter()
		mockFetchRejected(new Error("Network down"))

		render(<PostPublishedToggle postId={1} initialPublished={false} />)
		await userEvent.click(screen.getByRole("checkbox"))

		await waitFor(() =>
			expect(screen.getByText(/network down/i)).toBeInTheDocument()
		)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).not.toBeChecked()
		expect(checkbox).not.toBeDisabled()
	})
})

// #endregion
