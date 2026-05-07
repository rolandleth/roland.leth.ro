import * as matchers from "@testing-library/jest-dom/matchers"
import { afterEach, beforeEach, expect, vi } from "vitest"

expect.extend(matchers)

// Spy on each level so tests can assert what was logged at what level (audit
// success info, schema-validation warn, internal-error error). Restored in
// afterEach so a leaking mock can't bleed into the next test.
const originals = {
	error: console.error,
	warn: console.warn,
	info: console.info,
}

beforeEach(() => {
	console.error = vi.fn()
	console.warn = vi.fn()
	console.info = vi.fn()
})

afterEach(() => {
	console.error = originals.error
	console.warn = originals.warn
	console.info = originals.info
})
