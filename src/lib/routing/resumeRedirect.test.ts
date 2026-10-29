import { describe, expect, it } from "vitest"
import { RESUME_PATH, RESUME_REDIRECT } from "@/lib/routing/resumeRedirect"

// Blob store hosts are a lowercase alphanumeric store ID under this domain. The
// `STORE_ID` placeholder fails it on purpose, so a missing real URL shows up
// here before it ships a broken résumé link.
const BLOB_STORE_HOST = /^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/

// #region Résumé redirect

describe("RESUME_REDIRECT", () => {
	it("redirects the path the About page links to", () => {
		expect(RESUME_REDIRECT.source).toBe(RESUME_PATH)
	})

	it("is temporary, so browsers don't cache it for good", () => {
		expect(RESUME_REDIRECT.permanent).toBe(false)
	})

	it("points at a PDF in a real Blob store", () => {
		const destination = new URL(RESUME_REDIRECT.destination)

		expect(destination.protocol).toBe("https:")
		expect(destination.hostname).toMatch(BLOB_STORE_HOST)
		expect(destination.pathname).toMatch(/\.pdf$/)
	})

	it("asks Blob to send the file as a download", () => {
		const destination = new URL(RESUME_REDIRECT.destination)

		expect(destination.searchParams.get("download")).toBe("1")
	})
})

// #endregion
