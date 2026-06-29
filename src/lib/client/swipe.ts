import type { PanInfo } from "framer-motion"

// A swipe counts once it clears this horizontal travel (px) or is flicked
// faster than the velocity threshold (px/s) — the velocity path lets a quick,
// short flick page through without dragging the full distance.
const SWIPE_DISTANCE_THRESHOLD = 50
const SWIPE_VELOCITY_THRESHOLD = 400

/**
 * Maps a horizontal drag gesture to a page step. Direction is inverted from the
 * gesture: dragging left (negative offset/velocity) reveals the *next* image.
 * Returns `null` when the gesture falls short of both thresholds so the caller
 * can let it rubber-band back to centre.
 */
export function resolveSwipe(info: PanInfo): "next" | "prev" | null {
	const movedNext =
		info.offset.x < -SWIPE_DISTANCE_THRESHOLD ||
		info.velocity.x < -SWIPE_VELOCITY_THRESHOLD
	const movedPrev =
		info.offset.x > SWIPE_DISTANCE_THRESHOLD ||
		info.velocity.x > SWIPE_VELOCITY_THRESHOLD

	if (movedNext) {
		return "next"
	}

	if (movedPrev) {
		return "prev"
	}

	return null
}
