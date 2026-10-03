import { describe, expect, it } from "vitest"
import { ebmlHeader, ftypBox } from "@/test/mediaBytes"
import {
	detectVideoMime,
	isVideoUrl,
	MAX_VIDEO_UPLOAD_BYTES,
	MAX_VIDEO_UPLOAD_MIB,
	VIDEO_EXTENSIONS,
	VIDEO_MIMES,
	VIDEO_SNIFF_HEADER_BYTES,
} from "./video"

describe("isVideoUrl", () => {
	it.each([
		"/videos/demo.mp4",
		"/videos/demo.webm",
		"demo.mp4",
		"https://store.public.blob.vercel-storage.com/1b4e28ba-2fa1-41d2-883f-0016d3cca427-demo.mp4",
	])("accepts %s", (url) => {
		expect(isVideoUrl(url)).toBe(true)
	})

	it("ignores the case of the extension", () => {
		expect(isVideoUrl("/videos/DEMO.MP4")).toBe(true)
		expect(isVideoUrl("/videos/demo.WebM")).toBe(true)
	})

	it("ignores a query string and a fragment after the path", () => {
		expect(isVideoUrl("/videos/demo.mp4?v=2")).toBe(true)
		expect(isVideoUrl("/videos/demo.mp4#t=5")).toBe(true)
		expect(isVideoUrl("/videos/demo.webm?v=2#t=5")).toBe(true)
	})

	it.each([
		"/images/cover.png",
		"/images/animation.gif",
		// QuickTime: left out on purpose, see `VIDEO_MIMES`.
		"/videos/demo.mov",
		"/videos/demo.mkv",
		"",
	])("refuses %s", (url) => {
		expect(isVideoUrl(url)).toBe(false)
	})

	it("refuses a video extension that is not the end of the path", () => {
		expect(isVideoUrl("/videos/demo.mp4.png")).toBe(false)
		expect(isVideoUrl("/mp4/cover.png")).toBe(false)
		expect(isVideoUrl("/videos/demo.mp4/poster")).toBe(false)
	})

	it("refuses a video extension that only appears in the query or fragment", () => {
		expect(isVideoUrl("/images/cover.png?source=demo.mp4")).toBe(false)
		expect(isVideoUrl("/images/cover.png#demo.webm")).toBe(false)
	})

	it("refuses a bare extension name with no dot", () => {
		expect(isVideoUrl("/videos/mp4")).toBe(false)
	})
})

describe("detectVideoMime", () => {
	it.each([
		"isom",
		"iso2",
		"iso3",
		"iso4",
		"iso5",
		"iso6",
		"mp41",
		"mp42",
		"avc1",
		"M4V ",
		"dash",
	])("detects an MP4 with the major brand %j", (brand) => {
		expect(detectVideoMime(ftypBox(brand, []))).toBe("video/mp4")
	})

	it("detects an MP4 as ffmpeg writes it", () => {
		expect(
			detectVideoMime(ftypBox("isom", ["isom", "iso2", "avc1", "mp41"]))
		).toBe("video/mp4")
	})

	it("refuses a QuickTime movie", () => {
		expect(detectVideoMime(ftypBox("qt  ", []))).toBeNull()
	})

	it("refuses a QuickTime movie that lists an MP4 brand as compatible", () => {
		expect(detectVideoMime(ftypBox("qt  ", ["isom", "mp42"]))).toBeNull()
	})

	it.each(["M4A ", "avif", "heic", "mif1", "3gp4"])(
		"refuses the non-video ftyp brand %j",
		(brand) => {
			expect(detectVideoMime(ftypBox(brand, []))).toBeNull()
		}
	)

	it("is case-sensitive about brands", () => {
		expect(detectVideoMime(ftypBox("ISOM", []))).toBeNull()
	})

	it("detects a WebM", () => {
		expect(detectVideoMime(ebmlHeader("webm"))).toBe("video/webm")
	})

	it("refuses a Matroska file, which shares WebM's magic number", () => {
		expect(detectVideoMime(ebmlHeader("matroska"))).toBeNull()
	})

	it("refuses an EBML header cut off before its document type", () => {
		expect(detectVideoMime(ebmlHeader("webm").subarray(0, 20))).toBeNull()
	})

	it("refuses a WebM document type that sits past the sniffed bytes", () => {
		const late = new Uint8Array(VIDEO_SNIFF_HEADER_BYTES + 8)
		late.set([0x1a, 0x45, 0xdf, 0xa3], 0)
		late.set(new TextEncoder().encode("webm"), VIDEO_SNIFF_HEADER_BYTES)

		expect(detectVideoMime(late)).toBeNull()
	})

	it("reads a subarray from its own start", () => {
		const padded = new Uint8Array(64)
		padded.set(ftypBox("mp42", []), 8)

		expect(detectVideoMime(padded.subarray(8))).toBe("video/mp4")
	})

	it("accepts more bytes than it needs", () => {
		const whole = new Uint8Array(200_000)
		whole.set(ebmlHeader("webm"), 0)

		expect(detectVideoMime(whole)).toBe("video/webm")
	})

	it("refuses an empty or very short input", () => {
		expect(detectVideoMime(new Uint8Array(0))).toBeNull()
		expect(detectVideoMime(new Uint8Array([0x1a, 0x45]))).toBeNull()
		expect(detectVideoMime(ftypBox("isom", []).subarray(0, 10))).toBeNull()
	})

	it("refuses an image and a page named as a video", () => {
		const png = new Uint8Array([
			0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
		])
		const html = new TextEncoder().encode("<!doctype html><html>webm</html>")

		expect(detectVideoMime(png)).toBeNull()
		expect(detectVideoMime(html)).toBeNull()
	})
})

describe("MAX_VIDEO_UPLOAD_BYTES", () => {
	it("is the MiB cap in bytes", () => {
		expect(MAX_VIDEO_UPLOAD_BYTES).toBe(MAX_VIDEO_UPLOAD_MIB * 1024 * 1024)
	})
})

describe("VIDEO_EXTENSIONS", () => {
	it("names an extension for every accepted type", () => {
		for (const mime of VIDEO_MIMES) {
			expect(VIDEO_EXTENSIONS[mime]).toMatch(/^[a-z0-9]+$/)
		}
	})

	it("stores each type under an extension the renderer recognizes", () => {
		for (const mime of VIDEO_MIMES) {
			expect(isVideoUrl(`/clip.${VIDEO_EXTENSIONS[mime]}`)).toBe(true)
		}
	})
})
