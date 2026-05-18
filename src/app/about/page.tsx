import PageGlow from "@/components/PageGlow"
import { buildPageMetadata } from "@/lib/content/metadata"
import AboutContent from "./AboutContent"
import type { Metadata } from "next"

export const metadata: Metadata = buildPageMetadata({
	title: "About",
	description:
		"iOS developer, full-stack engineer, and founder. Learn more about Roland Leth.",
	path: "/about",
})

export default function AboutPage() {
	return (
		<div className="relative mx-auto max-w-4xl px-4 py-12">
			<PageGlow />
			<AboutContent />
		</div>
	)
}
