// The résumé lives in Vercel Blob, not `public/`, so updating it is an upload
// in the Blob dashboard rather than a deploy. Consumed by `next.config.ts`,
// beside the legacy rules, for the same reason they live there: a `redirects()`
// entry costs no function invocation.
//
// A redirect rather than the Blob URL in the About link: links people already
// saved to the site path keep working, and the URL people share stays on this
// domain.
//
// This module is imported by `next.config.ts`, so it uses no `@/` alias; see the
// note in `legacyRoutes.ts`.
import type { NextConfig } from "next"

type Redirect = Awaited<
	ReturnType<NonNullable<NextConfig["redirects"]>>
>[number]

/** The résumé's path on this site: the About page's link, and the shared URL. */
export const RESUME_PATH = "/downloads/resume.pdf"

/**
 * The résumé's Blob URL, as the dashboard shows it. A Blob URL is the store host
 * plus the pathname, so re-uploading to the same pathname keeps it; a random
 * suffix or a new pathname changes it and needs a deploy.
 *
 * Blob caches a file for a month by default, so after a re-upload a visitor
 * who downloaded the old copy can get it again from their browser cache.
 */
const RESUME_BLOB_URL =
	"https://1b8s9qdvrd8l8jfm.public.blob.vercel-storage.com/downloads/resume.pdf"

/**
 * Temporary (307), not permanent: browsers can cache a 308 for good, which would
 * pin every past visitor to Blob if the résumé ever moves back into `public/`.
 *
 * `?download=1` makes Blob answer with `Content-Disposition: attachment`. The
 * About link's `download` attribute can't do it: browsers ignore it once the
 * file is on another origin.
 */
export const RESUME_REDIRECT: Redirect = {
	source: RESUME_PATH,
	destination: `${RESUME_BLOB_URL}?download=1`,
	permanent: false,
}
