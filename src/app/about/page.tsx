import PageGlow from "@/components/PageGlow"
import AboutContent from "./AboutContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "About",
	description:
		"iOS developer, full-stack engineer, and founder. Learn more about Roland Leth.",
}

export default function AboutPage() {
	return (
		<main className="relative mx-auto max-w-4xl px-4 py-12">
			<PageGlow />
			<AboutContent />
		</main>
	)
}
