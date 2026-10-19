import {
	LEGACY_REDIRECTS,
	LEGACY_REWRITES,
} from "./src/lib/routing/legacyRoutes"
import type { NextConfig } from "next"

/**
 * The Content-Security-Policy. `unsafe-inline` is required by Next.js for
 * hydration scripts and Tailwind inline styles; tighten further with a
 * nonce-based CSP if inline scripts become a concern.
 *
 * @param canUploadToBlob The admin pages only: the video upload goes from the
 *   browser straight to the Vercel Blob API, which no public page talks to.
 */
function contentSecurityPolicy(
	isProd: boolean,
	{ canUploadToBlob }: { canUploadToBlob: boolean }
): string {
	return [
		"default-src 'self'",
		// Next.js hydration requires unsafe-inline; React dev mode requires unsafe-eval.
		`script-src 'self' 'unsafe-inline'${!isProd ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
		"style-src 'self' 'unsafe-inline'",
		// Allow images from self, Vercel Blob, and data URIs (e.g. base64 favicons).
		`img-src 'self' data: https://*.public.blob.vercel-storage.com${!isProd ? " https://picsum.photos https://fastly.picsum.photos" : ""}`,
		// Videos in a markdown body: uploaded to Vercel Blob, or served from `public/`.
		"media-src 'self' https://*.public.blob.vercel-storage.com",
		"font-src 'self' data:",
		// Vercel Analytics reporting endpoint, and on the admin pages the Vercel
		// Blob API.
		`connect-src 'self' https://vitals.vercel-insights.com${canUploadToBlob ? " https://vercel.com/api/blob/" : ""}`,
		"frame-ancestors 'none'",
	].join("; ")
}

const nextConfig: NextConfig = {
	images: {
		remotePatterns: [
			// Vercel Blob — production images
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
			},
			// Picsum — placeholder images in development
			...(process.env.NODE_ENV !== "production"
				? [
						{ protocol: "https" as const, hostname: "picsum.photos" },
						{ protocol: "http" as const, hostname: "localhost" },
						{ protocol: "https" as const, hostname: "fastly.picsum.photos" },
					]
				: []),
		],
	},
	// Legacy URL handling. Both lists live in `src/lib/routing/legacyRoutes.ts`
	// and used to run in `src/proxy.ts`; Vercel compiles them into its routing
	// layer, so they resolve without a function invocation. `redirects()` also
	// runs ahead of middleware, so a legacy hit never reaches one.
	async redirects() {
		return LEGACY_REDIRECTS
	},
	// `beforeFiles`, so the rewrite wins over the filesystem route that would
	// otherwise capture the URL — see the note in `legacyRoutes.ts`.
	async rewrites() {
		return { beforeFiles: LEGACY_REWRITES, afterFiles: [], fallback: [] }
	},
	async headers() {
		const isProd = process.env.NODE_ENV === "production"

		const securityHeaders = [
			// Prevent MIME-type sniffing.
			{ key: "X-Content-Type-Options", value: "nosniff" },
			// Disallow embedding in iframes.
			{ key: "X-Frame-Options", value: "DENY" },
			// Reduce referrer leakage to cross-origin requests.
			{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
			// Enforce HTTPS for 2 years, include subdomains.
			{
				key: "Strict-Transport-Security",
				value: "max-age=63072000; includeSubDomains; preload",
			},
			// Disable browser features not used by this site.
			{
				key: "Permissions-Policy",
				value: "camera=(), microphone=(), geolocation=()",
			},
			{
				key: "Content-Security-Policy",
				value: contentSecurityPolicy(isProd, { canUploadToBlob: false }),
			},
		]

		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
			{
				// Later entries override a key an earlier one set, so this replaces
				// the site-wide policy on the admin pages only.
				source: "/admin/:path*",
				headers: [
					{
						key: "Content-Security-Policy",
						value: contentSecurityPolicy(isProd, { canUploadToBlob: true }),
					},
				],
			},
			{
				// Bluesky/AT Protocol handle verification. The file has no
				// extension, so without this it serves as octet-stream — and the
				// site-wide `nosniff` header would stop the client recovering it.
				source: "/.well-known/atproto-did",
				headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
			},
		]
	},
}

export default nextConfig
