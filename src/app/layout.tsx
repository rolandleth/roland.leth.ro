import { Inter, JetBrains_Mono, Newsreader } from "next/font/google"
import ClientAnalytics from "@/components/ClientAnalytics"
import Footer from "@/components/Footer"
import Header from "@/components/Header"
import NavigationTypeTracker from "@/components/NavigationTypeTracker"
import ThemeProvider from "@/components/ThemeProvider"
import ThemeScript from "@/components/ThemeScript"
import { getSiteUrl } from "@/lib/auth/env"
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
		openGraph: {
			siteName: "Roland Leth",
			locale: "en_US",
			type: "website",
		},
		twitter: {
			card: "summary_large_image",
			creator: "@rolandleth",
		},
	}
}

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	return (
		<html
			lang="en"
			className={`${newsreader.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased`}
			suppressHydrationWarning
		>
			<body className="bg-background text-primary flex min-h-full flex-col font-sans">
				{/* Set the theme class before first paint (no flash). `globals.css`
					hides the page until a class is present; this reveals it once the
					class is set — and the `<noscript>` reveals it for visitors without
					JS, who would otherwise stay hidden. */}
				<ThemeScript />
				<noscript>
					<style>{`html:not(.dark):not(.light){visibility:visible}`}</style>
				</noscript>

				<a
					href="#main-content"
					className="bg-background text-primary focus-visible:border-accent sr-only z-50 rounded-md border px-3 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3"
				>
					Skip to main content
				</a>

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
			</body>
		</html>
	)
}
