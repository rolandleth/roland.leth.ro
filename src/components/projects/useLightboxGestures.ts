"use client"

import {
	animate,
	useMotionValue,
	useMotionValueEvent,
	useReducedMotion,
	type MotionValue,
} from "framer-motion"
import { useCallback, useEffect, useRef, useState } from "react"
import { resolveSwipeFromDelta } from "@/lib/client/swipe"
import {
	clamp,
	clampScale,
	clampTranslate,
	distance,
	midpoint,
	MIN_SCALE,
	toggleZoom,
	zoomAtPoint,
	type Point,
	type Size,
} from "@/lib/client/zoom"
import type { PointerEvent as ReactPointerEvent } from "react"

interface Options {
	/** Flat index of the current slide. */
	index: number
	/** Total slides, for resting-position math. */
	count: number
	/** Whether swiping may page to another slide. */
	canNavigate: boolean
	/** Page one slide in `direction`; the caller crosses section boundaries. */
	onStep: (direction: 1 | -1) => void
}

interface Gestures {
	/** Track translate (px) — bind to {@link GalleryTrack}'s `x`. */
	x: MotionValue<number>
	/** Active-slide transform — pass as `activeSlideStyle`. */
	slideStyle: {
		scale: MotionValue<number>
		x: MotionValue<number>
		y: MotionValue<number>
	}
	/** `true` while the current slide is magnified (drives the pan cursor). */
	isZoomed: boolean
	/** Callback ref for the stage element — owns measuring + the wheel listener. */
	setStage: (node: HTMLDivElement | null) => void
	/** Spread onto the stage element. */
	handlers: {
		onPointerDown: (event: ReactPointerEvent) => void
		onPointerMove: (event: ReactPointerEvent) => void
		onPointerUp: (event: ReactPointerEvent) => void
		onPointerCancel: (event: ReactPointerEvent) => void
		onDoubleClick: (event: React.MouseEvent) => void
	}
}

type Mode = "idle" | "swipe" | "pan" | "pinch"

// Same snap feel as the carousel — settles inside the 0.2–0.3s window.
const SNAP_SPRING = { type: "spring", stiffness: 320, damping: 34 } as const
// A press shorter than this that barely moves counts as a tap (not a swipe).
const TAP_MAX_MS = 250
const TAP_MAX_TRAVEL = 10
// Two taps within this window at nearly the same spot are a double-tap.
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 30
// Touchscreen pinch amplification: a raw pinch tracks fingers 1:1, which needs a
// huge spread to reach a useful zoom. Raising the finger-distance ratio to this
// power lets a comfortable pinch cover the range while staying symmetric
// (pinch-in undoes pinch-out by the same gesture). 1 would be exact 1:1.
const PINCH_ZOOM_GAIN = 2
// Trackpad pinch arrives as ctrl+wheel with small deltas; `scale *= exp(-delta *
// this)`. Higher than a mouse notch would want because the deltas are tiny — the
// per-event cap below keeps a large ctrl+wheel notch from flinging.
const PINCH_WHEEL_SENSITIVITY = 0.02
// Ceiling on a single wheel event's zoom step, so one big notch or a momentum
// spike can't jump the whole range at once (`exp(0.5) ≈ 1.65×`).
const WHEEL_MAX_STEP = 0.5
// `deltaX`/`deltaY` come in lines (mode 1) or pages (mode 2) on some browsers;
// normalise both to pixels so the tuning above holds across devices.
const WHEEL_LINE_HEIGHT = 16
const WHEEL_PAGE_HEIGHT = 400

/** Normalises a wheel delta to pixels regardless of the event's `deltaMode`. */
function normalizeWheelDelta(value: number, deltaMode: number): number {
	if (deltaMode === 1) {
		return value * WHEEL_LINE_HEIGHT
	}

	if (deltaMode === 2) {
		return value * WHEEL_PAGE_HEIGHT
	}

	return value
}

/**
 * Hand-rolled touch/mouse gestures for the lightbox: one pointer system that
 * arbitrates a horizontal swipe (page the gallery), a one-finger pan (when
 * zoomed), and a two-finger pinch, plus wheel and double-tap/double-click zoom.
 *
 * The geometry lives in `@/lib/client/zoom` (unit-tested); this hook is the
 * event-wiring layer, holding gesture baselines in refs and driving four motion
 * values so dragging never re-renders React. The stage is attached via the
 * returned `setStage` callback ref, which measures it and binds the non-passive
 * wheel listener that a passive React `onWheel` couldn't `preventDefault`.
 */
export function useLightboxGestures({
	index,
	count,
	canNavigate,
	onStep,
}: Options): Gestures {
	// Not covered by `<MotionPreferences>`: the standalone `animate()` takes
	// `reduceMotion` from its own options, never from MotionConfig context.
	const prefersReducedMotion = useReducedMotion()

	const x = useMotionValue(0)
	const scale = useMotionValue(1)
	const tx = useMotionValue(0)
	const ty = useMotionValue(0)

	const [isZoomed, setIsZoomed] = useState(false)
	useMotionValueEvent(scale, "change", (value) => setIsZoomed(value > 1))

	// Stage element + its measured size. Both are set through the callback ref so
	// they stay correct across the lightbox opening and closing (the hook itself
	// stays mounted the whole time, so a plain mount effect would miss the stage).
	const stage = useRef<HTMLDivElement | null>(null)
	const [size, setSize] = useState<Size>({ width: 0, height: 0 })
	const wheelCleanup = useRef<(() => void) | null>(null)
	const resizeCleanup = useRef<(() => void) | null>(null)

	// Live gesture state — refs so a drag never triggers a render.
	const pointers = useRef(new Map<number, Point>())
	const mode = useRef<Mode>("idle")
	// swipe
	const swipeStartX = useRef(0)
	const trackStart = useRef(0)
	const lastSample = useRef({ x: 0, t: 0 })
	const prevSample = useRef({ x: 0, t: 0 })
	// pan
	const panPointerStart = useRef<Point>({ x: 0, y: 0 })
	const panTranslateStart = useRef<Point>({ x: 0, y: 0 })
	// pinch
	const pinchStartDist = useRef(0)
	const pinchStartScale = useRef(1)
	const pinchStartTranslate = useRef<Point>({ x: 0, y: 0 })
	const pinchStartMid = useRef<Point>({ x: 0, y: 0 })
	// tap / press bookkeeping
	const downTime = useRef(0)
	const downPos = useRef<Point>({ x: 0, y: 0 })
	const lastTapTime = useRef(0)
	const lastTapPos = useRef<Point>({ x: 0, y: 0 })

	function animateTo(motionValue: MotionValue<number>, target: number) {
		if (prefersReducedMotion) {
			motionValue.set(target)
			return
		}

		animate(motionValue, target, SNAP_SPRING)
	}

	function stageSize(): Size {
		const rect = stage.current?.getBoundingClientRect()

		return rect
			? { width: rect.width, height: rect.height }
			: { width: 0, height: 0 }
	}

	// Client coordinate → offset from the stage centre (the focal frame the zoom
	// math works in).
	function focalFromClient(point: Point): Point {
		const rect = stage.current?.getBoundingClientRect()

		if (!rect) {
			return { x: 0, y: 0 }
		}

		return {
			x: point.x - (rect.left + rect.width / 2),
			y: point.y - (rect.top + rect.height / 2),
		}
	}

	// (Re)pick the active gesture from the current pointer count and zoom state —
	// called on every pointer add/remove so 2→1 finger transitions re-baseline
	// cleanly instead of stranding a half-finished pinch.
	function beginGesture(timeStamp: number) {
		const points = [...pointers.current.values()]

		if (points.length >= 2) {
			mode.current = "pinch"
			pinchStartDist.current = distance(points[0], points[1])
			pinchStartMid.current = midpoint(points[0], points[1])
			pinchStartScale.current = scale.get()
			pinchStartTranslate.current = { x: tx.get(), y: ty.get() }
			return
		}

		if (points.length === 1) {
			if (scale.get() > MIN_SCALE) {
				mode.current = "pan"
				panPointerStart.current = points[0]
				panTranslateStart.current = { x: tx.get(), y: ty.get() }
			} else {
				mode.current = "swipe"
				swipeStartX.current = points[0].x
				trackStart.current = x.get()
				prevSample.current = { x: points[0].x, t: timeStamp }
				lastSample.current = { x: points[0].x, t: timeStamp }
			}

			return
		}

		mode.current = "idle"
	}

	// Settle a released gesture: page/snap the strip, or clamp/reset the zoom.
	function finalize() {
		if (mode.current === "swipe") {
			const rest = -index * size.width
			const offset = x.get() - rest
			const span = lastSample.current.t - prevSample.current.t
			const velocity =
				span > 0
					? ((lastSample.current.x - prevSample.current.x) / span) * 1000
					: 0
			const swipe =
				canNavigate && count > 1
					? resolveSwipeFromDelta(offset, velocity)
					: null

			if (swipe === "next") {
				onStep(1)
			} else if (swipe === "prev") {
				onStep(-1)
			} else {
				// Fell short — rubber-band back. A successful step instead lets the
				// index effect spring the strip to the new slide.
				animateTo(x, rest)
			}

			return
		}

		if (mode.current === "pan" || mode.current === "pinch") {
			if (scale.get() <= MIN_SCALE + 0.01) {
				animateTo(scale, MIN_SCALE)
				animateTo(tx, 0)
				animateTo(ty, 0)
			} else {
				const clamped = clampTranslate(
					{ x: tx.get(), y: ty.get() },
					scale.get(),
					stageSize()
				)
				animateTo(tx, clamped.x)
				animateTo(ty, clamped.y)
			}
		}
	}

	function toggleZoomAt(clientPoint: Point) {
		const result = toggleZoom(
			scale.get(),
			{ x: tx.get(), y: ty.get() },
			focalFromClient(clientPoint),
			stageSize()
		)
		animateTo(scale, result.scale)
		animateTo(tx, result.translate.x)
		animateTo(ty, result.translate.y)
	}

	function onPointerDown(event: ReactPointerEvent) {
		try {
			stage.current?.setPointerCapture(event.pointerId)
		} catch {
			// setPointerCapture can throw if the pointer is already gone; the gesture
			// still tracks fine from the pointer map without capture.
		}

		pointers.current.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
		})
		downTime.current = event.timeStamp
		downPos.current = { x: event.clientX, y: event.clientY }
		beginGesture(event.timeStamp)
	}

	function onPointerMove(event: ReactPointerEvent) {
		if (!pointers.current.has(event.pointerId)) {
			return
		}

		pointers.current.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
		})
		const points = [...pointers.current.values()]

		if (mode.current === "pinch" && points.length >= 2) {
			const span = distance(points[0], points[1])
			const mid = midpoint(points[0], points[1])
			const ratio =
				pinchStartDist.current === 0 ? 1 : span / pinchStartDist.current
			// Amplify the raw finger-distance ratio so a comfortable pinch covers
			// the zoom range (see PINCH_ZOOM_GAIN).
			const factor = Math.pow(ratio, PINCH_ZOOM_GAIN)
			const nextScale = clampScale(pinchStartScale.current * factor)
			const focal = focalFromClient(pinchStartMid.current)
			const anchored = zoomAtPoint(
				pinchStartTranslate.current,
				pinchStartScale.current,
				nextScale,
				focal
			)
			// Add the two-finger pan drift on top of the anchored zoom.
			const drifted = {
				x: anchored.x + (mid.x - pinchStartMid.current.x),
				y: anchored.y + (mid.y - pinchStartMid.current.y),
			}
			const clamped = clampTranslate(drifted, nextScale, stageSize())
			scale.set(nextScale)
			tx.set(clamped.x)
			ty.set(clamped.y)
			return
		}

		if (mode.current === "pan") {
			const point = points[0]
			const clamped = clampTranslate(
				{
					x:
						panTranslateStart.current.x + (point.x - panPointerStart.current.x),
					y:
						panTranslateStart.current.y + (point.y - panPointerStart.current.y),
				},
				scale.get(),
				stageSize()
			)
			tx.set(clamped.x)
			ty.set(clamped.y)
			return
		}

		if (mode.current === "swipe") {
			const point = points[0]
			x.set(trackStart.current + (point.x - swipeStartX.current))
			prevSample.current = lastSample.current
			lastSample.current = { x: point.x, t: event.timeStamp }
		}
	}

	function onPointerUp(event: ReactPointerEvent) {
		if (!pointers.current.has(event.pointerId)) {
			return
		}

		pointers.current.delete(event.pointerId)

		try {
			stage.current?.releasePointerCapture(event.pointerId)
		} catch {
			// Already released — nothing to do.
		}

		const travel = distance(
			{ x: event.clientX, y: event.clientY },
			downPos.current
		)
		// Touch/pen taps drive double-tap zoom; a mouse uses the dblclick handler,
		// so exclude it here to avoid toggling twice.
		const isTap =
			pointers.current.size === 0 &&
			event.pointerType !== "mouse" &&
			event.timeStamp - downTime.current < TAP_MAX_MS &&
			travel < TAP_MAX_TRAVEL

		if (pointers.current.size === 0) {
			finalize()
			mode.current = "idle"

			if (isTap) {
				handleTap(event.timeStamp, { x: event.clientX, y: event.clientY })
			}

			return
		}

		beginGesture(event.timeStamp)
	}

	function handleTap(timeStamp: number, point: Point) {
		const isDoubleTap =
			timeStamp - lastTapTime.current < DOUBLE_TAP_MS &&
			distance(point, lastTapPos.current) < DOUBLE_TAP_SLOP

		if (isDoubleTap) {
			toggleZoomAt(point)
			lastTapTime.current = 0
			return
		}

		lastTapTime.current = timeStamp
		lastTapPos.current = point
	}

	function onDoubleClick(event: React.MouseEvent) {
		event.preventDefault()
		toggleZoomAt({ x: event.clientX, y: event.clientY })
	}

	// Callback ref: measure the stage, observe resizes, and bind the non-passive
	// wheel zoom. Runs with the node on mount and with `null` on unmount, so it
	// tracks the stage correctly each time the lightbox opens. Stable — the wheel
	// closure reads only the (stable) motion values and the node it's bound to.
	const setStage = useCallback(
		(node: HTMLDivElement | null) => {
			stage.current = node
			wheelCleanup.current?.()
			resizeCleanup.current?.()
			wheelCleanup.current = null
			resizeCleanup.current = null

			if (node === null) {
				return
			}

			// Pin the non-null node so the closures below keep the narrowing.
			const element = node

			function measure() {
				const rect = element.getBoundingClientRect()
				setSize((prev) =>
					prev.width === rect.width && prev.height === rect.height
						? prev
						: { width: rect.width, height: rect.height }
				)
			}

			measure()
			const observer = new ResizeObserver(measure)
			observer.observe(element)
			resizeCleanup.current = () => observer.disconnect()

			function onWheel(event: WheelEvent) {
				// Always cancel the native wheel: a trackpad pinch would otherwise
				// zoom the whole page, and a horizontal two-finger swipe would trigger
				// back/forward navigation out of the lightbox.
				event.preventDefault()
				const rect = element.getBoundingClientRect()
				const stage = { width: rect.width, height: rect.height }
				const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode)

				// Browsers report a trackpad pinch (and ctrl+wheel) as a ctrl-modified
				// wheel; that's the zoom gesture.
				if (event.ctrlKey) {
					const focal = {
						x: event.clientX - (rect.left + rect.width / 2),
						y: event.clientY - (rect.top + rect.height / 2),
					}
					const step = clamp(
						-deltaY * PINCH_WHEEL_SENSITIVITY,
						-WHEEL_MAX_STEP,
						WHEEL_MAX_STEP
					)
					const nextScale = clampScale(scale.get() * Math.exp(step))
					const anchored = zoomAtPoint(
						{ x: tx.get(), y: ty.get() },
						scale.get(),
						nextScale,
						focal
					)
					const clamped = clampTranslate(anchored, nextScale, stage)
					scale.set(nextScale)
					tx.set(clamped.x)
					ty.set(clamped.y)
					return
				}

				// A plain two-finger scroll pans the zoomed image (natural direction);
				// at fit size there's nothing to pan, so it's a no-op rather than a
				// surprise zoom.
				if (scale.get() > MIN_SCALE) {
					const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode)
					const clamped = clampTranslate(
						{ x: tx.get() - deltaX, y: ty.get() - deltaY },
						scale.get(),
						stage
					)
					tx.set(clamped.x)
					ty.set(clamped.y)
				}
			}

			element.addEventListener("wheel", onWheel, { passive: false })
			wheelCleanup.current = () => element.removeEventListener("wheel", onWheel)
		},
		[scale, tx, ty]
	)

	// Reset the zoom whenever the slide changes so every image opens at fit size.
	useEffect(() => {
		scale.set(MIN_SCALE)
		tx.set(0)
		ty.set(0)
	}, [index, scale, tx, ty])

	// Keep the strip aligned to the current slide (mirrors the carousel).
	useEffect(() => {
		const target = -index * size.width

		if (size.width === 0 || prefersReducedMotion) {
			x.set(target)
			return
		}

		const controls = animate(x, target, SNAP_SPRING)

		return () => controls.stop()
	}, [index, size.width, prefersReducedMotion, x])

	return {
		x,
		slideStyle: { scale, x: tx, y: ty },
		isZoomed,
		setStage,
		handlers: {
			onPointerDown,
			onPointerMove,
			onPointerUp,
			onPointerCancel: onPointerUp,
			onDoubleClick,
		},
	}
}
