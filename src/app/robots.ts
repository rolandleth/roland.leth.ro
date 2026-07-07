import { getSiteUrl } from "@/lib/auth/env"
import type { MetadataRoute } from "next"

export default async function robots(): Promise<MetadataRoute.Robots> {
	// Canonical origin, resolved from forwarded headers the same way `sitemap.ts`
	// and the Atom feed do, so the `Sitemap:` line always points at the live host.
	const base = getSiteUrl()

	// One allow-all rule, by design. The project landing pages are the apps'
	// primary discovery channel (the App Stores surface them poorly), so every
	// legitimate crawler — including AI answer-engine citation bots (GPTBot /
	// OAI-SearchBot / ChatGPT-User, ClaudeBot / Claude-User, PerplexityBot /
	// Perplexity-User, Googlebot, Google-Extended, Bingbot, Applebot /
	// Applebot-Extended) — is intentionally welcome. They're covered by the `*`
	// rule; no per-bot allow-list is needed.
	//
	// No "bad bot" user-agent blocklists: robots.txt is advisory, not a security
	// boundary. Scrapers ignore it and spoof user-agents, so a blocklist only
	// risks blocking the good crawlers above. Abusive traffic is handled at the
	// edge (Vercel / Cloudflare), not here.
	//
	// `/api/` is the only disallowed path — internal endpoints, not content. The
	// public RSS feed lives under `/api/feed/` (the `/feed` URL 301s into it), so
	// it's re-allowed; the longer `Allow` wins over the shorter `Disallow` for
	// those paths in every major crawler. Admin and auth routes are deliberately
	// NOT listed: auth already blocks crawlers, and naming a path in robots.txt
	// only advertises it. (Disallow is not noindex — it hides a snippet, not the
	// URL — so it's never used here to keep something out of results.)
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/api/feed/",
				disallow: "/api/",
			},
			{
				// `$`-anchored so this stays an exact-path block: a bare `/life`
				// disallow is a *prefix* match that would also hide a future
				// `/lifestyle` (and `/about-team`, etc.). CCBot honors the `$`
				// end-anchor like the other major crawlers.
				userAgent: "CCBot",
				disallow: ["/about$", "/life$"],
			},
		],
		sitemap: `${base}/sitemap.xml`,
	}
}
