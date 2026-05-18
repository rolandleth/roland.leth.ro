import { cleanup } from "@testing-library/react"
import React from "react"
import { afterEach, vi } from "vitest"

// Force `AnimatePresence` into `mode="sync"` for tests. Production uses
// `mode="wait"` in a few places (BlogSectionHeader, ExpandableSearch,
// Typewriter, ProjectContent), which means `exit + enter` run sequentially
// (~400ms per swap). Under `sync` they overlap (~200ms), and — crucially —
// the new child mounts immediately so `findByRole(...)` resolves on the first
// poll instead of after the exit animation. Real exit animations still run,
// which keeps the exiting form alive long enough for `submit` events to fire
// before unmount (otherwise we'd hit happy-dom's form-proxy `.contains()` bug).
vi.mock("framer-motion", async () => {
	const actual =
		await vi.importActual<typeof import("framer-motion")>("framer-motion")

	function AnimatePresence(
		props: React.ComponentProps<typeof actual.AnimatePresence>
	) {
		return React.createElement(actual.AnimatePresence, {
			...props,
			mode: "sync",
		})
	}

	return { ...actual, AnimatePresence }
})

afterEach(() => {
	cleanup()
})
