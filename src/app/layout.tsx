import { Inter, JetBrains_Mono, Newsreader } from "next/font/google"
import { cookies } from "next/headers"
import AnalyticsWithFilter from "@/app/AnalyticsWithFilter"
import SpeedInsightsWithFilter from "@/app/SpeedInsightsWithFilter"
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
				<ThemeProvider initialTheme={initialTheme}>
					<Header />
					{children}
					<SpeedInsightsWithFilter />
					<AnalyticsWithFilter />
					<Footer />
				</ThemeProvider>
			</body>
		</html>
	)
}
