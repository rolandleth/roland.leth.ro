// Pure geometry for the lightbox's pinch/wheel/double-tap zoom. Kept free of any
// DOM or React so the fiddly parts — anchoring a zoom to a focal point, clamping
// the pan so the image can't be dragged off its own edges — are unit-testable in
// isolation; the gesture hook is a thin event-wiring layer over these.

/** Never zoom below the fit-to-stage size. */
export const MIN_SCALE = 1
/** Ceiling on magnification, so pinch/wheel can't run away to a pixel soup. */
export const MAX_SCALE = 4
/** Where a double-tap/double-click jumps to when starting from the fit size. */
export const DOUBLE_TAP_SCALE = 2.5

export interface Point {
	x: number
	y: number
}

export interface Size {
	width: number
	height: number
}

/** Clamps `value` into the inclusive `[min, max]` range. */
export function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

/** Euclidean distance between two points (pinch span). */
export function distance(a: Point, b: Point): number {
	return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Midpoint of two points (pinch centre). */
export function midpoint(a: Point, b: Point): Point {
	return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/** Clamps a scale request into `[MIN_SCALE, MAX_SCALE]`. */
export function clampScale(scale: number): number {
	return clamp(scale, MIN_SCALE, MAX_SCALE)
}

/**
 * Clamps a pan offset so the scaled image can't be dragged past its own edges.
 * The image fills the stage at scale 1, so at scale `s` it overhangs the stage
 * by `(s - 1) * size / 2` on each axis — that overhang is exactly how far the
 * centre may travel before an edge would pull inside the frame.
 */
export function clampTranslate(
	translate: Point,
	scale: number,
	stage: Size
): Point {
	const maxX = Math.max(0, ((scale - 1) * stage.width) / 2)
	const maxY = Math.max(0, ((scale - 1) * stage.height) / 2)

	return {
		x: clamp(translate.x, -maxX, maxX),
		y: clamp(translate.y, -maxY, maxY),
	}
}

/**
 * New pan offset that keeps `focal` (measured from the stage centre) pinned to
 * the same pixel of the image while the scale changes from `oldScale` to
 * `newScale`.
 *
 * A content point `c` (offset from centre) renders at `translate + scale * c`.
 * Solving for the `translate` that leaves the point under `focal` fixed gives
 * `focal * (1 - ratio) + translate * ratio`, with `ratio = newScale / oldScale`.
 */
export function zoomAtPoint(
	translate: Point,
	oldScale: number,
	newScale: number,
	focal: Point
): Point {
	const ratio = newScale / oldScale

	return {
		x: focal.x * (1 - ratio) + translate.x * ratio,
		y: focal.y * (1 - ratio) + translate.y * ratio,
	}
}

/**
 * Double-tap/double-click toggle: from (near) the fit size, zoom in to
 * {@link DOUBLE_TAP_SCALE} anchored on the tap; otherwise reset to the fit size
 * centred. Returns the next scale and the clamped pan for it.
 */
export function toggleZoom(
	scale: number,
	translate: Point,
	focal: Point,
	stage: Size
): { scale: number; translate: Point } {
	// A hair above MIN_SCALE counts as "fit" so a pinch that didn't quite settle
	// back to 1 still toggles in on the next double-tap.
	const isFit = scale <= MIN_SCALE + 0.01

	if (!isFit) {
		return { scale: MIN_SCALE, translate: { x: 0, y: 0 } }
	}

	const zoomed = zoomAtPoint(translate, scale, DOUBLE_TAP_SCALE, focal)

	return {
		scale: DOUBLE_TAP_SCALE,
		translate: clampTranslate(zoomed, DOUBLE_TAP_SCALE, stage),
	}
}
