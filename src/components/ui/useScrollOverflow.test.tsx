import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { useScrollOverflow } from "./useScrollOverflow"

// Stub `ResizeObserver` so the test exercises only the scroll path — the
// behaviour under test — without depending on happy-dom's observer firing.
beforeAll(() => {
	class NoopResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	}

	vi.stubGlobal("ResizeObserver", NoopResizeObserver)
})

interface ScrollMetrics {
	scrollLeft: number
	scrollWidth: number
	clientWidth: number
}

// happy-dom doesn't compute layout, so scroll metrics are stubbed directly on a
// real element. `scrollLeft` stays writable so a test can scroll it and fire the
// event the hook listens for.
function makeScroller({ scrollLeft, scrollWidth, clientWidth }: ScrollMetrics) {
	const element = document.createElement("div")

	Object.defineProperty(element, "scrollWidth", {
		value: scrollWidth,
		configurable: true,
	})
	Object.defineProperty(element, "clientWidth", {
		value: clientWidth,
		configurable: true,
	})
	Object.defineProperty(element, "scrollLeft", {
		value: scrollLeft,
		writable: true,
		configurable: true,
	})

	document.body.appendChild(element)

	return element
}

afterEach(() => {
	document.body.innerHTML = ""
})

describe("useScrollOverflow", () => {
	it.each([
		[
			"reports no overflow when content fits the visible width",
			{ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 },
			false,
			false,
		],
		[
			"reports end-only overflow when scrolled to the start",
			{ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 },
			false,
			true,
		],
		[
			"reports both edges when scrolled to the middle",
			{ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 },
			true,
			true,
		],
		[
			"reports start-only overflow when scrolled to the end",
			{ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 },
			true,
			false,
		],
	] as const)("%s", (_label, metrics, expectedStart, expectedEnd) => {
		const element = makeScroller(metrics)
		const ref = { current: element }
		const { result } = renderHook(() => useScrollOverflow(ref))

		expect(result.current.canScrollStart).toBe(expectedStart)
		expect(result.current.canScrollEnd).toBe(expectedEnd)
	})

	it("recomputes on scroll", () => {
		const element = makeScroller({
			scrollLeft: 0,
			scrollWidth: 600,
			clientWidth: 300,
		})
		const ref = { current: element }
		const { result } = renderHook(() => useScrollOverflow(ref))

		expect(result.current.canScrollStart).toBe(false)

		act(() => {
			element.scrollLeft = 300
			element.dispatchEvent(new Event("scroll"))
		})

		expect(result.current.canScrollStart).toBe(true)
		expect(result.current.canScrollEnd).toBe(false)
	})

	it("treats a 1px gap as no overflow (sub-pixel tolerance)", () => {
		const element = makeScroller({
			scrollLeft: 1,
			scrollWidth: 601,
			clientWidth: 600,
		})
		const ref = { current: element }
		const { result } = renderHook(() => useScrollOverflow(ref))

		// scrollLeft 1 isn't `> 1`, and 1 isn't `< (1 - 1)`, so both edges read
		// as not-scrollable — the fades stay hidden for rounding noise.
		expect(result.current.canScrollStart).toBe(false)
		expect(result.current.canScrollEnd).toBe(false)
	})
})
