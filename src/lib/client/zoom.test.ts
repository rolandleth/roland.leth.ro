import { describe, expect, it } from "vitest"
import {
	clamp,
	clampScale,
	clampTranslate,
	DOUBLE_TAP_SCALE,
	distance,
	MAX_SCALE,
	midpoint,
	MIN_SCALE,
	toggleZoom,
	zoomAtPoint,
} from "./zoom"

const stage = { width: 800, height: 600 }

describe("clamp", () => {
	it("bounds a value into the inclusive range", () => {
		expect(clamp(5, 0, 10)).toBe(5)
		expect(clamp(-1, 0, 10)).toBe(0)
		expect(clamp(11, 0, 10)).toBe(10)
	})
})

describe("distance / midpoint", () => {
	it("measures the span and centre of two points", () => {
		const a = { x: 0, y: 0 }
		const b = { x: 3, y: 4 }
		expect(distance(a, b)).toBe(5)
		expect(midpoint(a, b)).toEqual({ x: 1.5, y: 2 })
	})
})

describe("clampScale", () => {
	it("holds scale within the zoom range", () => {
		expect(clampScale(0.2)).toBe(MIN_SCALE)
		expect(clampScale(99)).toBe(MAX_SCALE)
		expect(clampScale(2)).toBe(2)
	})
})

describe("clampTranslate", () => {
	it("pins the pan to zero when not zoomed (no overhang to pan into)", () => {
		expect(clampTranslate({ x: 200, y: 200 }, 1, stage)).toEqual({ x: 0, y: 0 })
	})

	it("allows panning up to the per-side overhang on each axis", () => {
		// At scale 2 the image is twice the 800×600 stage, so it overhangs by a
		// full stage on each side: the centre may travel ±400 horizontally and
		// ±300 vertically before an edge would pull into the frame.
		expect(clampTranslate({ x: 900, y: 900 }, 2, stage)).toEqual({
			x: 400,
			y: 300,
		})
		expect(clampTranslate({ x: -900, y: -900 }, 2, stage)).toEqual({
			x: -400,
			y: -300,
		})
	})

	it("leaves an in-bounds pan untouched", () => {
		expect(clampTranslate({ x: 50, y: -25 }, 2, stage)).toEqual({
			x: 50,
			y: -25,
		})
	})
})

describe("zoomAtPoint", () => {
	it("keeps the stage centre fixed when the focal point is the centre", () => {
		// Focal at centre (0,0), starting centred: no pan is introduced by zooming.
		expect(zoomAtPoint({ x: 0, y: 0 }, 1, 2, { x: 0, y: 0 })).toEqual({
			x: 0,
			y: 0,
		})
	})

	it("pushes the pan so an off-centre focal pixel stays under the cursor", () => {
		// Zooming 1→2 at a focal 100px right of centre must shift the content left
		// by 100 so that same pixel stays put: focal*(1-2) + 0*2 = -100.
		expect(zoomAtPoint({ x: 0, y: 0 }, 1, 2, { x: 100, y: 0 })).toEqual({
			x: -100,
			y: 0,
		})
	})

	it("is invertible back to the original pan", () => {
		const focal = { x: 40, y: -30 }
		const zoomed = zoomAtPoint({ x: 0, y: 0 }, 1, 3, focal)
		const back = zoomAtPoint(zoomed, 3, 1, focal)
		expect(back.x).toBeCloseTo(0)
		expect(back.y).toBeCloseTo(0)
	})
})

describe("toggleZoom", () => {
	it("zooms in from the fit size, anchored on the tap and clamped in-bounds", () => {
		const result = toggleZoom(1, { x: 0, y: 0 }, { x: 100, y: 0 }, stage)
		expect(result.scale).toBe(DOUBLE_TAP_SCALE)
		// Anchored pan is -150 (100 * (1 - 2.5)); the ±600 bound at 2.5×
		// (1.5 * 800 / 2) leaves it untouched here.
		expect(result.translate.x).toBeCloseTo(-150)
		expect(result.translate.y).toBeCloseTo(0)
	})

	it("resets to the centred fit size when already zoomed", () => {
		const result = toggleZoom(
			DOUBLE_TAP_SCALE,
			{ x: 120, y: 40 },
			{ x: 0, y: 0 },
			stage
		)
		expect(result).toEqual({ scale: MIN_SCALE, translate: { x: 0, y: 0 } })
	})

	it("treats a not-quite-settled scale as fit and still zooms in", () => {
		const result = toggleZoom(1.005, { x: 0, y: 0 }, { x: 0, y: 0 }, stage)
		expect(result.scale).toBe(DOUBLE_TAP_SCALE)
	})
})
