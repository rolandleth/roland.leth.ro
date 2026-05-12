import type { Section } from "@/lib/sections"

/**
 * Structured audit-log payload for admin write handlers. Every key is part of
 * the shape regardless of handler — call sites pass `null` when the field
 * doesn't apply, so a log aggregator can write one parser instead of a
 * per-handler dispatch. Keys are required (not optional) so a future caller
 * dropping a relevant field is caught by tsc instead of silently emitting
 * `null` for a change the handler actually made (e.g. a slug rename that
 * forgets to populate `previousSlug`).
 */
export interface AdminAuditPayload {
	id: number
	slug: string | null
	section: Section | null
	sortOrder: number | null
	previousSection: Section | null
	previousSlug: string | null
}

/**
 * Closed enum of audit-log tags. Typing the `tag` parameter prevents a typo
 * call site (`"[api:admin:psots:PUT]"`) from silently emitting a malformed
 * line that breaks log-aggregator greps. New admin write surfaces extend this
 * union so every audit line is greppable from a single source of tag values.
 */
export type AdminAuditTag =
	| "[api:admin:posts:POST]"
	| "[api:admin:posts:PUT]"
	| "[api:admin:posts:DELETE]"
	| "[api:admin:projects:POST]"
	| "[api:admin:projects:PUT]"
	| "[api:admin:projects:DELETE]"

/**
 * Emits a structured `console.info` audit line for admin writes. Every call
 * site provides every key (with `null` for fields that don't apply) so the
 * line shape is stable across post/project POST/PUT/DELETE.
 */
export function auditLog(tag: AdminAuditTag, payload: AdminAuditPayload): void {
	// eslint-disable-next-line no-console
	console.info(`${tag} success`, payload)
}
