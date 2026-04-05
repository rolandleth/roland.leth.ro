import * as matchers from "@testing-library/jest-dom/matchers"
import { afterEach, beforeEach, expect, vi } from "vitest"

expect.extend(matchers)

const originalConsoleError = console.error

beforeEach(() => {
	console.error = vi.fn()
})

afterEach(() => {
	console.error = originalConsoleError
})
