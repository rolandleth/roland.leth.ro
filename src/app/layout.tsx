import { Inter, JetBrains_Mono, Newsreader } from "next/font/google"
import { cookies } from "next/headers"
import ClientAnalytics from "@/components/ClientAnalytics"
import Footer from "@/components/Footer"
import Header from "@/components/Header"
import ThemeProvider from "@/components/ThemeProvider"
import { siteBase } from "@/lib/request"
import { resolveInitialTheme, resolveInitialThemeClass } from "@/lib/theme"
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
		metadataBase: new URL(await siteBase()),
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

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	const cookieStore = await cookies()
	const rawCookie = cookieStore.get("theme")?.value

	const initialTheme = resolveInitialTheme(rawCookie)
	// Resolve the class server-side to avoid a flash on load. First-time
	// visitors have no cookie: no class is set and globals.css hides the page
	// until client JS applies it.
	const themeClass = resolveInitialThemeClass(rawCookie) ?? ""

	return (
		<html
			lang="en"
			className={`${newsreader.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased ${themeClass}`.trimEnd()}
			suppressHydrationWarning
		>
			<body className="bg-background text-primary flex min-h-full flex-col font-sans">
				<a
					href="#main-content"
					className="bg-background text-primary focus-visible:border-accent sr-only z-50 rounded-md border px-3 py-2 text-sm font-medium focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3"
				>
					Skip to main content
				</a>

				<ThemeProvider initialTheme={initialTheme}>
					<Header />
					<div id="main-content" tabIndex={-1} className="flex flex-1 flex-col">
						{children}
					</div>
					<ClientAnalytics />
					<Footer />
				</ThemeProvider>
			</body>
		</html>
	)
}
