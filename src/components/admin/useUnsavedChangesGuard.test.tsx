import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	confirmDiscardUnsavedChanges,
	DISCARD_UNSAVED_CHANGES_MESSAGE,
} from "@/lib/client/unsavedChanges"
import { setupUser } from "@/test/user"
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard"

const user = setupUser()

/**
 * A guarded form and the kinds of link the admin can click. `onNavigate`
 * stands in for Next's `<Link>` handler, a React `onClick` on the anchor.
 */
function Harness({
	isDirty,
	onNavigate,
}: {
	isDirty: boolean
	onNavigate: () => void
}) {
	useUnsavedChangesGuard(isDirty)

	function handleClick(event: React.MouseEvent) {
		// Keep happy-dom from attempting a real navigation.
		event.preventDefault()
		onNavigate()
	}

	return (
		<>
			<a href="/admin?tab=projects" onClick={handleClick}>
				In app
			</a>
			<a href="/admin?tab=projects" target="_blank" onClick={handleClick}>
				New tab
			</a>
			<a href="https://example.com/" onClick={handleClick}>
				Elsewhere
			</a>
			<a href="#section" onClick={handleClick}>
				Same page
			</a>
			<a href="/admin?tab=projects" onClick={handleClick}>
				<span>Nested label</span>
			</a>
			<a href="/admin/cover.png" download onClick={handleClick}>
				Download
			</a>
			<a href="/admin/posts/1/edit?preview=1" onClick={handleClick}>
				Same path, new query
			</a>
		</>
	)
}

let confirm: ReturnType<typeof vi.fn>

beforeEach(() => {
	confirm = vi.fn()
	vi.stubGlobal("confirm", confirm)
	window.history.replaceState(null, "", "/admin/posts/1/edit")
})

afterEach(() => {
	vi.unstubAllGlobals()
})

function renderHarness(isDirty: boolean) {
	const onNavigate = vi.fn()
	const view = render(<Harness isDirty={isDirty} onNavigate={onNavigate} />)

	return { ...view, onNavigate }
}

describe("useUnsavedChangesGuard, link clicks", () => {
	it("lets a clean form leave without asking", async () => {
		const { onNavigate } = renderHarness(false)

		await user.click(screen.getByText("In app"))

		expect(confirm).not.toHaveBeenCalled()
		expect(onNavigate).toHaveBeenCalledOnce()
	})

	it("asks before a dirty form follows an in-app link", async () => {
		confirm.mockReturnValue(true)
		const { onNavigate } = renderHarness(true)

		await user.click(screen.getByText("In app"))

		expect(confirm).toHaveBeenCalledWith(DISCARD_UNSAVED_CHANGES_MESSAGE)
		expect(onNavigate).toHaveBeenCalledOnce()
	})

	it("stops the navigation before the link's own handler when the admin stays", async () => {
		confirm.mockReturnValue(false)
		const { onNavigate } = renderHarness(true)

		await user.click(screen.getByText("In app"))

		expect(onNavigate).not.toHaveBeenCalled()
	})

	it("guards a click on an element nested inside the link", async () => {
		confirm.mockReturnValue(false)
		const { onNavigate } = renderHarness(true)

		await user.click(screen.getByText("Nested label"))

		expect(confirm).toHaveBeenCalledOnce()
		expect(onNavigate).not.toHaveBeenCalled()
	})

	it.each([
		["a modified click", { metaKey: true }],
		["a ctrl click", { ctrlKey: true }],
		["a shift click", { shiftKey: true }],
		["an alt click", { altKey: true }],
		["a middle click", { button: 1 }],
	])(
		"lets %s through, since it opens a new tab or downloads",
		(_label, init) => {
			renderHarness(true)

			fireEvent.click(screen.getByText("In app"), init)

			expect(confirm).not.toHaveBeenCalled()
		}
	)

	it.each(["New tab", "Elsewhere", "Same page", "Download"])(
		"doesn't ask on the %j link",
		async (label) => {
			// A new tab keeps the form; another site unloads the page, which
			// `beforeunload` covers; a hash link stays on the page; a download
			// doesn't leave it.
			renderHarness(true)

			await user.click(screen.getByText(label))

			expect(confirm).not.toHaveBeenCalled()
		}
	)

	it("asks on a link to the same path with a different query", async () => {
		// Next renders a new page for a new query, so the form's state goes.
		confirm.mockReturnValue(false)
		const { onNavigate } = renderHarness(true)

		await user.click(screen.getByText("Same path, new query"))

		expect(confirm).toHaveBeenCalledOnce()
		expect(onNavigate).not.toHaveBeenCalled()
	})

	it("doesn't ask when an earlier handler already cancelled the click", () => {
		// A window capture listener runs before the guard's document one.
		function cancelClick(event: MouseEvent) {
			event.preventDefault()
		}

		window.addEventListener("click", cancelClick, true)

		try {
			renderHarness(true)

			fireEvent.click(screen.getByText("In app"))

			expect(confirm).not.toHaveBeenCalled()
		} finally {
			window.removeEventListener("click", cancelClick, true)
		}
	})

	it("stops asking once the form is clean again", async () => {
		const { rerender, onNavigate } = renderHarness(true)

		rerender(<Harness isDirty={false} onNavigate={onNavigate} />)
		await user.click(screen.getByText("In app"))

		expect(confirm).not.toHaveBeenCalled()
	})
})

describe("useUnsavedChangesGuard, unload", () => {
	function dispatchBeforeUnload(): Event {
		const event = new Event("beforeunload", { cancelable: true })
		window.dispatchEvent(event)

		return event
	}

	it("asks the browser to confirm closing the tab while dirty", () => {
		renderHarness(true)

		expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
	})

	it("leaves unload alone while clean", () => {
		renderHarness(false)

		expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
	})

	it("stops guarding unload after the form unmounts", () => {
		const { unmount } = renderHarness(true)

		unmount()

		expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
	})
})

describe("useUnsavedChangesGuard, the shared registry", () => {
	it("makes confirmDiscardUnsavedChanges ask while a form is dirty", () => {
		confirm.mockReturnValue(false)
		renderHarness(true)

		expect(confirmDiscardUnsavedChanges()).toBe(false)
		expect(confirm).toHaveBeenCalledOnce()
	})

	it("lets confirmDiscardUnsavedChanges pass without asking once the form unmounts", () => {
		const { unmount } = renderHarness(true)

		unmount()

		expect(confirmDiscardUnsavedChanges()).toBe(true)
		expect(confirm).not.toHaveBeenCalled()
	})
})
