import { beforeEach, describe, expect, it, vi } from "vitest"
import { ADMIN_EDIT_TAGS, adminEditMetadata } from "./adminMetadata"
import { verifySession } from "./auth"

vi.mock("./auth", () => ({
	verifySession: vi.fn(),
}))

const mockVerifySession = vi.mocked(verifySession)

// `src/test/setup.ts` already replaces `console.error` with a `vi.fn()` before
// every test, so read that mock rather than layering a `vi.spyOn` on top of it —
// a spy here would mock a mock, and its `mockRestore()` would restore to the
// setup mock rather than the real console.
const consoleError = () => vi.mocked(console.error)

const TAG = ADMIN_EDIT_TAGS.posts

function buildMetadata(
	overrides: Partial<Parameters<typeof adminEditMetadata>[0]> = {}
) {
	return adminEditMetadata({
		tag: TAG,
		id: "7",
		fallback: "Edit post",
		loadName: async () => "Hello world",
		...overrides,
	})
}

describe("adminEditMetadata", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("titles the page from the record when the session is valid", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(buildMetadata()).resolves.toEqual({
			title: "Edit: Hello world",
		})
	})

	it("falls back when the record is missing", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(
			buildMetadata({ loadName: async () => null })
		).resolves.toEqual({ title: "Edit post" })
	})

	// The point of the guard: metadata runs outside `(protected)/layout.tsx`, so
	// without this an unauthenticated request that slips past the middleware
	// matcher reaches the DB read and leaks the record's name in the title.
	it("never runs the loader without a valid session", async () => {
		mockVerifySession.mockResolvedValue(false)
		const loadName = vi.fn().mockResolvedValue("Secret draft")

		await expect(buildMetadata({ loadName })).resolves.toEqual({
			title: "Edit post",
		})
		expect(loadName).not.toHaveBeenCalled()
	})

	it("falls back on an unparseable id without running the loader", async () => {
		mockVerifySession.mockResolvedValue(true)
		const loadName = vi.fn()

		await expect(buildMetadata({ id: "not-an-id", loadName })).resolves.toEqual(
			{ title: "Edit post" }
		)
		expect(loadName).not.toHaveBeenCalled()
	})

	// #region loader failure

	// A throwing loader is the one failure mode that neither degrades to the
	// fallback nor leaves a trace: it propagates out of `generateMetadata` and
	// 500s the page.
	it("falls back instead of propagating when the loader throws", async () => {
		mockVerifySession.mockResolvedValue(true)

		await expect(
			buildMetadata({
				loadName: async () => {
					throw new Error("connection reset")
				},
			})
		).resolves.toEqual({ title: "Edit post" })
	})

	it("logs a loader failure, so a DB outage isn't read as a missing record", async () => {
		mockVerifySession.mockResolvedValue(true)
		const error = new Error("connection reset")

		await buildMetadata({
			loadName: async () => {
				throw error
			},
		})

		// Two arguments carrying `bypassId`, matching every other line in this
		// defence layer. The old three-argument shape matched none of the alert
		// greps built on the group, so a DB outage here logged into the void.
		//
		// `error` is the plain-property `errorDetails` shape, not the raw Error —
		// nesting the Error itself would serialize to `{}` under a JSON-based log
		// pipeline, dropping the message and stack this line exists to capture.
		expect(consoleError()).toHaveBeenCalledWith(`${TAG} loadName failed`, {
			bypassId: expect.any(String),
			id: "7",
			error: { message: error.message, stack: error.stack },
		})
	})

	// #endregion

	// #region bypass logging

	it("logs at error level, because reaching here means the gate was bypassed", async () => {
		// The mirror of `requireAdmin`'s equivalent test. The middleware answers
		// unauthenticated page requests before `generateMetadata` runs, so a line
		// here means the matcher missed the path — the only signal that it has a
		// hole, since the fallback title is indistinguishable from a missing record.
		mockVerifySession.mockResolvedValue(false)

		await buildMetadata()

		expect(consoleError()).toHaveBeenCalledWith(
			expect.stringContaining(TAG),
			expect.anything()
		)
		expect(consoleError()).toHaveBeenCalledWith(
			expect.stringContaining("middleware gate did not run"),
			expect.anything()
		)
	})

	// For a line whose whole purpose is "the matcher has a hole", the id that got
	// through is the field that narrows which path did.
	it("carries the id and a joinable bypassId in the payload", async () => {
		mockVerifySession.mockResolvedValue(false)

		await buildMetadata({ id: "42" })

		expect(consoleError()).toHaveBeenCalledWith(
			expect.any(String),
			expect.objectContaining({
				id: "42",
				surface: "generateMetadata",
				bypassId: expect.any(String),
			})
		)
	})

	// The reordering's whole point. Parsing before the session check meant an
	// unauthenticated request with a garbage id returned early and emitted no
	// page-tagged line — exactly the shape a fuzzer probing for a matcher hole
	// sends, and the one case where page attribution matters most.
	it("logs an unauthenticated request even when the id is unparseable", async () => {
		mockVerifySession.mockResolvedValue(false)

		await buildMetadata({ id: "not-an-id", loadName: vi.fn() })

		expect(consoleError()).toHaveBeenCalledWith(
			expect.stringContaining("middleware gate did not run"),
			expect.objectContaining({ id: "not-an-id" })
		)
	})

	it("does not log when the session is valid", async () => {
		mockVerifySession.mockResolvedValue(true)

		await buildMetadata()

		expect(consoleError()).not.toHaveBeenCalled()
	})

	// #endregion
})
