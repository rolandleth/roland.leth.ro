import type { Section } from "@/lib/sections"

/**
 * Structured audit-log payload for admin write handlers. Every key is part of
 * the shape regardless of handler — missing values pass through as `null` so a
 * log aggregator can write one parser instead of a per-handler dispatch. The
 * trade is slightly longer log lines (six keys vs. three or four per call) for
 * stable shape across every admin POST/PUT/DELETE.
 */
export interface AdminAuditPayload {
	id: number
	slug?: string | null
	section?: Section | null
	sortOrder?: number | null
	previousSection?: Section | null
	previousSlug?: string | null
}

/**
 * Emits a structured `console.info` audit line for admin writes. Centralises
 * the per-handler payload-shape variance Phase 5 introduced (posts vs projects
 * carried different key sets); now every audit line has the same key set with
 * `null` for absent fields.
 */
export function auditLog(tag: string, payload: AdminAuditPayload): void {
	const normalized = {
		id: payload.id,
		slug: payload.slug ?? null,
		section: payload.section ?? null,
		sortOrder: payload.sortOrder ?? null,
		previousSection: payload.previousSection ?? null,
		previousSlug: payload.previousSlug ?? null,
	}
	// eslint-disable-next-line no-console
	console.info(`${tag} success`, normalized)
}
