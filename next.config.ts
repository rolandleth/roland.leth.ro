import type { NextConfig } from "next"

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
			// CSP: unsafe-inline required by Next.js for hydration scripts and Tailwind inline styles.
			// Tighten further with nonce-based CSP if inline scripts become a concern.
			{
				key: "Content-Security-Policy",
				value: [
					"default-src 'self'",
					// Next.js hydration requires unsafe-inline; React dev mode requires unsafe-eval.
					`script-src 'self' 'unsafe-inline'${!isProd ? " 'unsafe-eval'" : ""} https://va.vercel-scripts.com`,
					"style-src 'self' 'unsafe-inline'",
					// Allow images from self, Vercel Blob, and data URIs (e.g. base64 favicons).
					`img-src 'self' data: https://*.public.blob.vercel-storage.com${!isProd ? " https://picsum.photos https://fastly.picsum.photos" : ""}`,
					"font-src 'self' data:",
					// Vercel Analytics reporting endpoint.
					"connect-src 'self' https://vitals.vercel-insights.com",
					"frame-ancestors 'none'",
				].join("; "),
			},
		]

		return [
			{
				source: "/(.*)",
				headers: securityHeaders,
			},
		]
	},
}

export default nextConfig
