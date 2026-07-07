import type { PanInfo } from "framer-motion"

// A swipe counts once it clears this horizontal travel (px) or is flicked
// faster than the velocity threshold (px/s) — the velocity path lets a quick,
// short flick page through without dragging the full distance.
const SWIPE_DISTANCE_THRESHOLD = 50
const SWIPE_VELOCITY_THRESHOLD = 400

/**
 * Maps a horizontal drag to a page step from its raw offset (px) and velocity
 * (px/s). Direction is inverted from the gesture: dragging left (negative
 * offset/velocity) reveals the *next* image. Returns `null` when the gesture
 * falls short of both thresholds so the caller can let it rubber-band back to
 * centre.
 *
 * The `PanInfo` overload ({@link resolveSwipe}) feeds framer-motion's carousel
 * drag; the hand-rolled lightbox gestures call this directly with their own
 * measured offset and velocity.
 */
export function resolveSwipeFromDelta(
	offsetX: number,
	velocityX: number
): "next" | "prev" | null {
	const movedNext =
		offsetX < -SWIPE_DISTANCE_THRESHOLD || velocityX < -SWIPE_VELOCITY_THRESHOLD
	const movedPrev =
		offsetX > SWIPE_DISTANCE_THRESHOLD || velocityX > SWIPE_VELOCITY_THRESHOLD

	if (movedNext) {
		return "next"
	}

	if (movedPrev) {
		return "prev"
	}

	return null
}

/** Framer-motion `PanInfo` adapter over {@link resolveSwipeFromDelta}. */
export function resolveSwipe(info: PanInfo): "next" | "prev" | null {
	return resolveSwipeFromDelta(info.offset.x, info.velocity.x)
}
