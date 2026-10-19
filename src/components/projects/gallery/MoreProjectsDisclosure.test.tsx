import { act, render, screen } from "@testing-library/react"
import { animate, motionValue, useReducedMotion } from "framer-motion"
import { useContext, useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import MoreProjectsDisclosure from "./MoreProjectsDisclosure"
import {
	MoreProjectsMotionContext,
	SlideFromPreview,
} from "./MoreProjectsMotion"
import type { PreviewOffset } from "./MoreProjectsMotion"

// happy-dom lays nothing out and framer animates on frames, so both are taken
// in hand: `animate` only records its call, and each test ends an animation by
// calling the `onComplete` it was given; `getBoundingClientRect` answers from
// the stubbed rects below.

vi.mock("framer-motion", async (importOriginal) => {
	const actual = await importOriginal<typeof import("framer-motion")>()

	return {
		...actual,
		animate: vi.fn(() => ({ stop: () => undefined })),
		useReducedMotion: vi.fn(() => false),
	}
})

type AnimateOptions = { duration?: number; onComplete?: () => void }

/** The options of the `n`th `animate` call, from 1. */
function animation(n: number): AnimateOptions {
	return vi.mocked(animate).mock.calls[n - 1][2] as AnimateOptions
}

const RECTS: Record<string, Partial<DOMRect>> = {
	"preview:a": { left: 10, top: 20 },
	"list:a": { left: 110, top: 220 },
	"preview:b": { left: 60, top: 20 },
	"list:b": { left: 60, top: 300 },
	previewLayer: { height: 80 },
	listLayer: { height: 400 },
}

function stubRects() {
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
		function (this: Element) {
			const projectId = this.getAttribute("data-project-id")
			const isInList = this.closest("[role=region]") != null
			const key =
				projectId == null
					? (this.getAttribute("data-testid") ?? "")
					: `${isInList ? "list" : "preview"}:${projectId}`

			return { left: 0, top: 0, height: 0, ...RECTS[key] } as DOMRect
		}
	)
}

/** What `MotionProbe` read from the disclosure's motion context. */
const probe: { offsetOf: ((projectId: string) => PreviewOffset) | null } = {
	offsetOf: null,
}

/** Hands the test the disclosure's motion context. */
function MotionProbe() {
	const context = useContext(MoreProjectsMotionContext)

	useEffect(() => {
		probe.offsetOf = context?.offsetOf ?? null
	})

	return null
}

function offsetOf(projectId: string): PreviewOffset | undefined {
	return probe.offsetOf?.(projectId)
}

function renderDisclosure(preview: React.ReactNode | null = previewRow()) {
	render(
		<MoreProjectsDisclosure id="more" count={2} preview={preview}>
			<MotionProbe />
			<ul>
				<li data-project-id="a">A</li>
				<li data-project-id="b">B</li>
			</ul>
		</MoreProjectsDisclosure>
	)

	// The layers carry no test id, so the stub learns them by position.
	const [previewLayer, listLayer] = [
		...screen
			.getByRole("button")
			.closest("section")!
			.querySelectorAll("section > div > div"),
	]
	previewLayer.setAttribute("data-testid", "previewLayer")
	listLayer.setAttribute("data-testid", "listLayer")

	return { previewLayer, listLayer }
}

function previewRow() {
	return (
		<ul>
			<li data-project-id="a">A</li>
			<li data-project-id="b">B</li>
		</ul>
	)
}

function toggle() {
	act(() => {
		screen.getByRole("button").click()
	})
}

function finish(n: number) {
	act(() => {
		animation(n).onComplete?.()
	})
}

beforeEach(() => {
	vi.mocked(animate).mockClear()
	vi.mocked(useReducedMotion).mockReturnValue(false)
	probe.offsetOf = null
	stubRects()
})

afterEach(() => {
	vi.restoreAllMocks()
})

// #region Measuring

describe("MoreProjectsDisclosure — measuring", () => {
	it("sets each preview icon's offset from its place in the list on open", () => {
		renderDisclosure()

		toggle()

		// Preview minus list: where the slide starts, relative to its place.
		expect(offsetOf("a")?.x.get()).toBe(-100)
		expect(offsetOf("a")?.y.get()).toBe(-200)
		expect(offsetOf("b")?.x.get()).toBe(0)
		expect(offsetOf("b")?.y.get()).toBe(-280)
	})

	it("measures again on every toggle, so a layout change since is picked up", () => {
		renderDisclosure()
		toggle()
		finish(1)

		RECTS["list:a"] = { left: 30, top: 220 }
		toggle()

		expect(offsetOf("a")?.x.get()).toBe(-20)
		RECTS["list:a"] = { left: 110, top: 220 }
	})
})

// #endregion

// #region Motion

describe("MoreProjectsDisclosure — motion", () => {
	it("animates over 0.3s by default", () => {
		renderDisclosure()

		toggle()

		expect(animation(1).duration).toBeCloseTo(0.3)
	})

	it("switches at once for a reader who asks for less motion", () => {
		vi.mocked(useReducedMotion).mockReturnValue(true)
		renderDisclosure()

		toggle()

		expect(animation(1).duration).toBe(0)
	})

	it("settles open only once its animation ends", async () => {
		const { listLayer } = renderDisclosure()
		const box = listLayer.parentElement as HTMLElement

		toggle()
		// Framer writes a motion value to the style on its next frame.
		await act(
			() => new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
		)

		// Opening: the list already counts as open for assistive tech, and the
		// box follows the animated height, from the closed one measured.
		expect(listLayer).not.toHaveAttribute("aria-hidden", "true")
		expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
		expect(box.style.height).toBe("80px")

		finish(1)

		// Open: the box takes its content's height again.
		expect(box.style.height).toBe("auto")
	})

	it("ignores a superseded animation's end after two reversals", () => {
		// Open, close and open again before anything lands: the close's end
		// arriving late must not shut the list the reader just opened.
		const { listLayer } = renderDisclosure()

		toggle()
		toggle()
		toggle()
		finish(2)

		expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
		expect(listLayer).not.toHaveAttribute("aria-hidden", "true")

		finish(1)
		finish(3)

		expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true")
	})

	it("closes once the close's own animation ends", () => {
		const { previewLayer } = renderDisclosure()

		toggle()
		finish(1)
		toggle()

		// Closing: the preview takes over only when the icons land on it.
		expect(previewLayer).toHaveAttribute("aria-hidden", "true")

		finish(2)

		expect(previewLayer).not.toHaveAttribute("aria-hidden", "true")
	})
})

// #endregion

// #region Preview layer

describe("MoreProjectsDisclosure — preview layer", () => {
	it("pads the preview row under the heading", () => {
		const { previewLayer } = renderDisclosure()

		expect(previewLayer).toHaveClass("pt-6")
	})

	it("leaves no empty band under the heading without a preview", () => {
		// Only open source projects: nothing to preview.
		const { previewLayer, listLayer } = renderDisclosure(null)

		expect(previewLayer).not.toHaveClass("pt-6")
		expect(listLayer).toHaveClass("pt-6")
	})
})

// #endregion

// #region SlideFromPreview

describe("SlideFromPreview", () => {
	function renderSlide(progress: number, offset: { x: number; y: number }) {
		const value = {
			progress: motionValue(progress),
			offsetOf: () => ({ x: motionValue(offset.x), y: motionValue(offset.y) }),
		}
		const { container } = render(
			<MoreProjectsMotionContext.Provider value={value}>
				<SlideFromPreview projectId="a">A</SlideFromPreview>
			</MoreProjectsMotionContext.Provider>
		)

		return container.firstElementChild as HTMLElement
	}

	it("sits on its preview icon while closed", () => {
		expect(renderSlide(0, { x: -100, y: -200 }).style.transform).toBe(
			"translateX(-100px) translateY(-200px)"
		)
	})

	it("is halfway there halfway through", () => {
		expect(renderSlide(0.5, { x: -100, y: -200 }).style.transform).toBe(
			"translateX(-50px) translateY(-100px)"
		)
	})

	it("sits in its place in the list when open", () => {
		expect(renderSlide(1, { x: -100, y: -200 }).style.transform).toBe("none")
	})
})

// #endregion
