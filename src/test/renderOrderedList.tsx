import { render } from "@testing-library/react"
import { type ReactNode, useState } from "react"
import type {
	OrderedItem,
	OrderedListChange,
} from "@/components/admin/useOrderedList"

/**
 * Renders a list manager (`LinkManager`, `FaqManager`, `SectionManager`) over
 * real state, the way `ProjectForm` holds it. The managers report changes as
 * updaters of the latest list, so a `vi.fn()` `onChange` would only capture
 * functions; this applies them and exposes the list they produce.
 */
export function renderOrderedList<T extends OrderedItem>(
	initial: T[],
	renderManager: (value: T[], onChange: OrderedListChange<T>) => ReactNode
): { latest: () => T[] } {
	let current = initial

	function Harness() {
		const [items, setItems] = useState(initial)
		current = items

		return renderManager(items, setItems)
	}

	render(<Harness />)

	return { latest: () => current }
}
