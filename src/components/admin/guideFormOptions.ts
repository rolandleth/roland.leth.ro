/**
 * Shared option shapes and constants for the guide and guide-topic admin forms.
 * Kept out of `GuideForm` so `GuideTopicForm` doesn't import from a sibling
 * component just to reuse a type (which made `GuideForm`'s export surface a
 * de-facto types module).
 */

/** A topic the guide form can attach a guide to. */
export interface GuideFormTopicOption {
	id: number
	title: string
	projectSlug: string | null
}

/** A project a guide or topic can reference by slug. */
export interface GuideFormProjectOption {
	slug: string
	name: string
}

/**
 * The `<select>` value standing in for a null FK — `""` round-trips badly
 * through change handlers, so an explicit sentinel is used and mapped back to
 * `null` on submit.
 */
export const NONE = "none"
