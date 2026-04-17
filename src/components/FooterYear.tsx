"use client"

/**
 * Tiny client island that owns just the copyright year. Lets `Footer` stay a
 * server component while still self-correcting on year boundaries — the lazy
 * initializer runs on the server (for SSR HTML) and again on hydration (for
 * the visitor's clock). If a stale cache served an older year,
 * `suppressHydrationWarning` lets React keep the fresh client value silently
 * instead of treating the mismatch as a bug.
 */
export default function FooterYear() {
	return <span suppressHydrationWarning>{new Date().getFullYear()}</span>
}
