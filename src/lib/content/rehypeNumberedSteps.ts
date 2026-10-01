import type { Element, ElementContent, Root, RootContent, Text } from "hast"

// `### 1. Title`: the number, a period, whitespace, then the title.
const STEP_PREFIX = /^(\d+)\.\s+(?=\S)/

const HEADING_TAGS: ReadonlySet<string> = new Set([
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
])

/**
 * Rehype plugin for product-page section bodies: a run of `### 1. Title`
 * headings, each with everything up to the next heading, becomes one ordered
 * list of steps.
 *
 * ```html
 * <ol class="product-steps" role="list">
 *   <li class="product-step">
 *     <h3 class="product-step__title">
 *       <span class="product-step__num">1<span class="sr-only">. </span></span>
 *       <span>Title</span>
 *     </h3>
 *     <div class="product-step__body">…</div>
 *   </li>
 * </ol>
 * ```
 *
 * The number keeps its period for screen readers ("1. Title") but not on
 * screen. `role="list"` because the list is styled without markers, and Safari
 * drops list semantics from an unmarked list. Only top-level headings count;
 * a heading that doesn't match ends the run and stays as it was.
 */
export function rehypeNumberedSteps() {
	return (tree: Root) => {
		tree.children = groupSteps(tree.children)
	}
}

interface StepHeading {
	number: string
	/** The heading's content with the `1. ` prefix removed. */
	title: ElementContent[]
}

function groupSteps(children: RootContent[]): RootContent[] {
	const result: RootContent[] = []
	let index = 0

	while (index < children.length) {
		const node = children[index]

		if (parseStepHeading(node) == null) {
			result.push(node)
			index += 1
			continue
		}

		const items: Element[] = []
		let heading = parseStepHeading(children[index])

		while (heading != null) {
			const { body, next } = collectBody(children, index + 1)

			items.push(stepItem(heading, body))
			index = next
			heading =
				index < children.length ? parseStepHeading(children[index]) : null
		}

		result.push(element("ol", ["product-steps"], items, { role: "list" }))
	}

	return result
}

/**
 * Everything from `start` up to the next heading: one step's body. `next` is
 * the index of that heading, or the end of `children`.
 */
function collectBody(
	children: RootContent[],
	start: number
): { body: ElementContent[]; next: number } {
	const body: ElementContent[] = []
	let index = start

	while (index < children.length && !isHeading(children[index])) {
		const sibling = children[index]

		if (sibling.type !== "doctype") {
			body.push(sibling)
		}

		index += 1
	}

	return { body, next: index }
}

function isHeading(node: RootContent): boolean {
	return node.type === "element" && HEADING_TAGS.has(node.tagName)
}

/** The step's number and title, or null when `node` isn't a `### 1. Title`. */
function parseStepHeading(node: RootContent): StepHeading | null {
	if (node.type !== "element" || node.tagName !== "h3") {
		return null
	}

	const [first, ...rest] = node.children

	if (first?.type !== "text") {
		return null
	}

	const match = STEP_PREFIX.exec(first.value)

	if (match == null) {
		return null
	}

	const remainder: Text = {
		type: "text",
		value: first.value.slice(match[0].length),
	}

	return { number: match[1], title: [remainder, ...rest] }
}

function stepItem({ number, title }: StepHeading, body: ElementContent[]) {
	return element(
		"li",
		["product-step"],
		[
			element(
				"h3",
				["product-step__title"],
				[
					element(
						"span",
						["product-step__num"],
						[
							{ type: "text", value: number },
							element("span", ["sr-only"], [{ type: "text", value: ". " }]),
						]
					),
					element("span", [], title),
				]
			),
			element("div", ["product-step__body"], body),
		]
	)
}

function element(
	tagName: string,
	className: string[],
	children: ElementContent[],
	extraProperties: Record<string, string> = {}
): Element {
	return {
		type: "element",
		tagName,
		properties: {
			...(className.length > 0 ? { className } : {}),
			...extraProperties,
		},
		children,
	}
}
