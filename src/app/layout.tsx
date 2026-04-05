import { SpeedInsights } from "@vercel/speed-insights/next"
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google"
import { cookies } from "next/headers"
import AnalyticsWithFilter from "@/app/AnalyticsWithFilter"
import Footer from "@/components/Footer"
import SiteChrome from "@/components/SiteChrome"
import ThemeProvider, { type Theme } from "@/components/ThemeProvider"
import type { Metadata } from "next"
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

const siteUrl = process.env.NEXTAUTH_URL

export const metadata: Metadata = {
	metadataBase: siteUrl ? new URL(siteUrl) : undefined,
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

// Valid cookie values — "system" is encoded with its resolved dark/light suffix.
const validCookieValues = [
	"light",
	"dark",
	"system-light",
	"system-dark",
] as const

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode
}>) {
	const cookieStore = await cookies()
	const rawCookie = cookieStore.get("theme")?.value
	const cookieTheme = validCookieValues.find((v) => v === rawCookie) ?? null

	const initialTheme: Theme =
		cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : "system"
	// Set the class server-side to avoid a flash on load.
	// "system-*" cookies let us resolve the correct class even for system users.
	// First-time visitors have no cookie: no class is set and globals.css hides
	// the page until client JS applies it.
	const themeClass: string = cookieTheme?.includes("dark")
		? "dark"
		: cookieTheme?.includes("light")
			? "light"
			: ""

	return (
		<html
			lang="en"
			className={`${newsreader.variable} ${inter.variable} ${jetBrainsMono.variable} h-full antialiased ${themeClass}`.trimEnd()}
			suppressHydrationWarning
		>
			<body className="bg-background text-primary flex min-h-full flex-col font-sans">
				<ThemeProvider initialTheme={initialTheme}>
					<SiteChrome />
					{children}
					<SpeedInsights />
					<AnalyticsWithFilter />
					<Footer />
				</ThemeProvider>
			</body>
		</html>
	)
}
