import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ProductToc } from "./ProductToc"

// happy-dom never fires an IntersectionObserver and answers `matchMedia` from
// its own window size, so both are faked: the tests move sections in and out
// of the band, and the window across 1080px.

class FakeIntersectionObserver {
	static readonly instances: FakeIntersectionObserver[] = []
	readonly observed = new Set<Element>()
	isDisconnected = false

	constructor(
		readonly callback: IntersectionObserverCallback,
		readonly options?: IntersectionObserverInit
	) {
		FakeIntersectionObserver.instances.push(this)
	}

	observe(target: Element) {
		this.observed.add(target)
	}

	unobserve(target: Element) {
		this.observed.delete(target)
	}

	disconnect() {
		this.isDisconnected = true
		this.observed.clear()
	}

	takeRecords(): IntersectionObserverEntry[] {
		return []
	}
}

/** The observer the rail runs now, if any. */
function liveObserver(): FakeIntersectionObserver | undefined {
	return FakeIntersectionObserver.instances.findLast(
		(observer) => !observer.isDisconnected
	)
}

/** Reports these sections entering (true) or leaving (false) the band. */
function report(changes: Record<string, boolean>) {
	const observer = liveObserver()

	if (observer == null) {
		throw new Error("No observer is running")
	}

	const entries = Object.entries(changes).map(
		([id, isIntersecting]) =>
			({
				target: document.getElementById(id),
				isIntersecting,
			}) as unknown as IntersectionObserverEntry
	)

	act(() => {
		observer.callback(entries, observer as unknown as IntersectionObserver)
	})
}

let isRailShown = true
const railListeners = new Set<() => void>()

/** Moves the window across 1080px and tells the listeners. */
function setRailShown(isShown: boolean) {
	isRailShown = isShown
	act(() => {
		railListeners.forEach((listener) => listener())
	})
}

const ITEMS = [
	{ id: "why", title: "Why" },
	{ id: "how", title: "How it works" },
	{ id: "faq", title: "FAQ" },
]

function renderToc() {
	// The targets the rail looks up by id.
	for (const { id } of ITEMS) {
		const section = document.createElement("section")
		section.id = id
		document.body.append(section)
	}

	return render(<ProductToc items={ITEMS} />)
}

function markedTitle(): string | null {
	const marked = screen
		.getAllByRole("link")
		.filter((link) => link.getAttribute("aria-current") === "true")

	expect(marked.length).toBeLessThanOrEqual(1)

	return marked[0]?.textContent ?? null
}

beforeEach(() => {
	FakeIntersectionObserver.instances.length = 0
	isRailShown = true
	railListeners.clear()
	vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
	vi.stubGlobal("matchMedia", (query: string) => ({
		media: query,
		get matches() {
			return isRailShown
		},
		addEventListener: (_type: string, listener: () => void) =>
			railListeners.add(listener),
		removeEventListener: (_type: string, listener: () => void) =>
			railListeners.delete(listener),
	}))
})

afterEach(() => {
	vi.unstubAllGlobals()
	document.body.innerHTML = ""
})

// #region Marker

describe("ProductToc — the marked section", () => {
	it("marks nothing at load", () => {
		renderToc()

		expect(markedTitle()).toBeNull()
	})

	it("watches every listed section in the band", () => {
		renderToc()

		expect(liveObserver()?.options?.rootMargin).toBe("-30% 0px -60% 0px")
		expect([...(liveObserver()?.observed ?? [])].map((el) => el.id)).toEqual([
			"why",
			"how",
			"faq",
		])
	})

	it("marks the section that enters the band", () => {
		renderToc()

		report({ why: true })

		expect(markedTitle()).toBe("Why")
	})

	it("moves the mark when the next section enters and the last one leaves", () => {
		renderToc()
		report({ why: true })

		report({ how: true, why: false })

		expect(markedTitle()).toBe("How it works")
	})

	it("marks the first in list order while two share the band", () => {
		renderToc()

		// Reported in a later callback, the lower section must not win.
		report({ how: true })
		report({ why: true })

		expect(markedTitle()).toBe("Why")
	})

	it("keeps the mark on a section still in the band when another leaves", () => {
		renderToc()
		report({ why: true, how: true })

		report({ why: false })

		expect(markedTitle()).toBe("How it works")
	})

	it("clears the mark on a scroll back into the hero", () => {
		renderToc()
		report({ why: true })

		report({ why: false })

		expect(markedTitle()).toBeNull()
	})

	it("clears the mark once the FAQ scrolls up and away into the closing", () => {
		renderToc()
		report({ faq: true })

		report({ faq: false })

		expect(markedTitle()).toBeNull()
	})
})

// #endregion

// #region Rail width

describe("ProductToc — below 1080px", () => {
	it("observes nothing while the rail is hidden", () => {
		isRailShown = false
		renderToc()

		expect(liveObserver()).toBeUndefined()
	})

	it("stops observing and clears the mark when the window narrows", () => {
		renderToc()
		report({ why: true })

		setRailShown(false)

		expect(liveObserver()).toBeUndefined()
		expect(markedTitle()).toBeNull()
	})

	it("starts observing when the window widens past 1080px", () => {
		isRailShown = false
		renderToc()

		setRailShown(true)
		report({ how: true })

		expect(markedTitle()).toBe("How it works")
	})

	it("disconnects and stops listening on unmount", () => {
		const { unmount } = renderToc()
		const observer = liveObserver()

		unmount()

		expect(observer?.isDisconnected).toBe(true)
		expect(railListeners.size).toBe(0)
	})
})

// #endregion
