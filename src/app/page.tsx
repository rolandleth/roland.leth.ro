import HomeContent from "./HomeContent"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Roland Leth — iOS Developer & Full-Stack Engineer",
	description:
		"iOS developer, full-stack engineer. Building things that matter since 2011.",
}

export default function Home() {
	return <HomeContent />
}
