import { Inter, JetBrains_Mono, Newsreader } from "next/font/google"
import ClientAnalytics from "@/components/ClientAnalytics"
import Footer from "@/components/Footer"
import Header from "@/components/Header"
import MotionPreferences from "@/components/MotionPreferences"
import NavigationTypeTracker from "@/components/NavigationTypeTracker"
import ThemeProvider from "@/components/ThemeProvider"
import ThemeScript from "@/components/ThemeScript"
import { getSiteUrl } from "@/lib/auth/env"
import { NO_SCRIPT_FADE_RULE } from "@/lib/client/motion"
import { feedPathForSection, feedTitleForSection } from "@/lib/content/feed"
import {
	defaultOgImage,
	ogImageEntry,
	siteOpenGraph,
	siteTwitter,
} from "@/lib/content/metadata"
import type { Metadata, Viewport } from "next"
// eslint-disable-next-line import/no-unassigned-import
import "./globals.css"

const newsreader = Newsreader({
	variable: "--font-heading",
	subsets: ["latin"],
	style: ["normal", "italic"],
})

const inter = Inter({
	variable: "--font-body",
	subsets: ["latin"],
})

const jetBrainsMono = JetBrains_Mono({
	variable: "--font-code",
	subsets: ["latin"],
})

export const viewport: Viewport = {
	viewportFit: "cover",
}

export async function generateMetadata(): Promise<Metadata> {
	return {
		metadataBase: new URL(getSiteUrl()),
		title: {
			template: "%s | Roland Leth",
			default: "Roland Leth",
		},
		description: "iOS developer & full-stack engineer",
		// Site-wide feed-autodiscovery default: pages that don't set their own
		// `alternates` (everything outside `/blog/:section/*`, which advertises
		// its own section feed) surface the tech feed. Next replaces `alternates`
		// wholesale from deeper segments, so the blog pages re-declare the feed
		// rather than inheriting this. The `title` is required — without it
		// readers list the feed by its raw URL.
		alternates: {
			types: {
				"application/atom+xml": [
					{
						url: feedPathForSection("tech"),
						title: feedTitleForSection("tech"),
					},
				],
			},
		},
		// Spread from the shared constants, not literals: these reach only pages
		// that define no `openGraph`/`twitter` of their own, and everything else
		// picks them up via `buildPageMetadata`. Two copies would drift.
		openGraph: {
			...siteOpenGraph,
			type: "website",
			images: [ogImageEntry(defaultOgImage)],
		},
		twitter: {
			...siteTwitter,
			images: [ogImageEntry(defaultOgImage)],
		},
	}
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		// `data-scroll-behavior`: Next.js turns smooth scrolling off for the
		// scroll-to-top of a route change when this is set, so the smooth in-page
		// jumps on product pages (globals.css) don't animate every navigation too.
		<html
			lang="en"
			data-scroll-behavior="smooth"
			className={`${newsreader.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<body className="bg-background text-primary flex min-h-full flex-col font-sans">
				{/* Set the theme class before first paint (no flash). `globals.css`
					hides the page until a class is present; this reveals it once the
					class is set — and the `<noscript>` reveals it for visitors without
					JS, who would otherwise stay hidden. It also shows the `fadeUp`
					content, which the prerender writes at opacity 0. */}
				<ThemeScript />
				<noscript>
					<style>{`html:not(.dark):not(.light){visibility:visible}${NO_SCRIPT_FADE_RULE}`}</style>
				</noscript>

				<a
					href="#main-content"
					className="bg-background text-primary focus-visible:border-accent sr-only z-50 rounded-md border px-3 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3"
				>
					Skip to main content
				</a>

				{/* Outermost provider: reduced-motion handling has to reach every
					animated component, and nesting it here means it keeps doing so
					however the providers below are rearranged. */}
				<MotionPreferences>
					<ThemeProvider>
						<NavigationTypeTracker />
						<Header />
						{/* Single document `<main>` lives here so the skip link targets
							the actual landmark. Pages render their content as plain
							wrappers (`<div>`/`<section>`) inside this. `tabIndex={-1}`
							lets the skip link move keyboard focus into the landmark
							without making it a tab stop. */}
						<main
							id="main-content"
							tabIndex={-1}
							className="flex flex-1 flex-col"
						>
							{children}
						</main>
						<ClientAnalytics />
						<Footer />
					</ThemeProvider>
				</MotionPreferences>
			</body>
		</html>
	)
}
