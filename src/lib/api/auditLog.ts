import type { Section } from "@/lib/db/sections"

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
	/**
	 * Correlation id for bulk write surfaces (currently only `[api:admin:posts:BULK]`).
	 * `null` for single-row handlers. With a `batchId` on every line of a bulk
	 * batch, `rg "batchId\":\"<uuid>"` collapses a 50-file run interleaved with
	 * unrelated traffic in the Vercel log retention window.
	 */
	batchId: string | null
}

/**
 * Closed enum of audit-log tags. Typing the `tag` parameter prevents a typo
 * call site (`"[api:admin:psots:PUT]"`) from silently emitting a malformed
 * line that breaks log-aggregator greps. New admin write surfaces extend this
 * list so every audit line is greppable from a single source of tag values.
 *
 * Exported as a `const` array (not a hand-written union) so the runtime list
 * is greppable too — adding a new admin resource only edits one place, and
 * the union type is derived from `typeof ADMIN_AUDIT_TAGS[number]`.
 */
export const ADMIN_AUDIT_TAGS = [
	"[api:admin:posts:POST]",
	"[api:admin:posts:PUT]",
	"[api:admin:posts:DELETE]",
	"[api:admin:posts:BULK]",
	"[api:admin:projects:POST]",
	"[api:admin:projects:PUT]",
	"[api:admin:projects:DELETE]",
] as const

export type AdminAuditTag = (typeof ADMIN_AUDIT_TAGS)[number]

/**
 * Emits a structured `console.info` audit line for admin writes. Every call
 * site provides every key (with `null` for fields that don't apply) so the
 * line shape is stable across post/project POST/PUT/DELETE.
 */
export function auditLog(tag: AdminAuditTag, payload: AdminAuditPayload): void {
	// eslint-disable-next-line no-console
	console.info(`${tag} success`, payload)
}
