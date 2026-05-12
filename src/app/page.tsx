import HomeHero from "@/components/home/HomeHero"
import LandingBackground from "@/components/home/LandingBackground"
import type { Metadata } from "next"

export const metadata: Metadata = {
	// `absolute` bypasses the root layout's `"%s | Roland Leth"` template;
	// without it the landing page would render as
	// "Roland Leth — iOS Developer & Full-Stack Engineer | Roland Leth"
	// (the brand is already in the title, so the template double-brands).
	title: {
		absolute: "Roland Leth — iOS Developer & Full-Stack Engineer",
	},
	description:
		"iOS developer, full-stack engineer. Building things that matter since 2011.",
}

export default function Home() {
	return (
		<div className="relative flex flex-1 flex-col items-center justify-center px-4">
			<LandingBackground />
			<HomeHero />
		</div>
	)
}
