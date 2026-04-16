import HomeHero from "@/components/home/HomeHero"
import LandingBackground from "@/components/home/LandingBackground"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Roland Leth — iOS Developer & Full-Stack Engineer",
	description:
		"iOS developer, full-stack engineer. Building things that matter since 2011.",
}

export default function Home() {
	return (
		<main className="relative flex flex-1 flex-col items-center justify-center px-4">
			<LandingBackground />
			<HomeHero />
		</main>
	)
}
