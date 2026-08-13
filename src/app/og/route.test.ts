import { existsSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"
import { defaultOgImage } from "@/lib/content/metadata"
import { GET } from "./route"

// #region production gate

describe("GET /og", () => {
	// The route is a design tool. Serving it in production would give the same
	// artwork a second source of truth that drifts from the committed PNG as soon
	// as either is regenerated — and would put a font CDN in the request path.
	it("404s in production", async () => {
		vi.stubEnv("NODE_ENV", "production")

		const response = await GET()

		expect(response.status).toBe(404)
	})

	// The render path itself isn't exercised here: it fetches fonts over the
	// network and hands the rest to Satori, so a test of it would assert Satori's
	// behaviour over a live dependency rather than anything this file decides.
})

// #endregion

// #region committed asset

describe("defaultOgImage", () => {
	// `card: "summary_large_image"` promises an image on every page. If this file
	// is missing, every surface on the site advertises a 404 to scrapers — the
	// same invisible failure the card was added to fix, one level down. Nothing
	// else would catch it: the metadata is still well-formed.
	it("points at a file that exists in public/", () => {
		const filePath = path.join(process.cwd(), "public", defaultOgImage)

		expect(existsSync(filePath), `${defaultOgImage} is not in public/`).toBe(
			true
		)
	})

	it("is a root-relative path, so it resolves against metadataBase", () => {
		expect(defaultOgImage.startsWith("/")).toBe(true)
	})
})

// #endregion
