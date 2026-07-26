import { vi } from "vitest"

/**
 * Factory for the shared `@/lib/api/requireAdmin` mock. Route tests call their
 * handlers directly, outside any request scope, so the real guard's
 * `cookies()` read throws — every admin route test needs this.
 *
 * Resolves to `null` (authorized), so a handler under test runs its real body.
 * The guard's own behavior is covered by `requireAdmin.test.ts`, and the
 * "every admin handler is guarded" contract by `adminAuthContract.test.ts` —
 * neither of which mocks it.
 *
 * Must be a function (not a top-level constant) because `vi.mock` is hoisted
 * above imports — a captured reference to a module-level object would be
 * accessed before initialization at mock-factory time.
 */
export function requireAdminMockFactory() {
	return {
		requireAdmin: vi.fn().mockResolvedValue(null),
	}
}
