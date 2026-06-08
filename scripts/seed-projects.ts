import "dotenv/config"
import { PrismaPg } from "@prisma/adapter-pg"
import {
	PlatformBucket,
	PlatformTag,
	PrismaClient,
} from "../src/generated/prisma/client"

const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
})

type ProjectInput = {
	name: string
	slug: string
	summary: string
	icon: string | null
	heroImage: string | null
	bucket: PlatformBucket
	platformTags: PlatformTag[]
	role: string | null
	accentColor: string | null
	isFeatured: boolean
	isDiscontinued: boolean
	date: string | null
	sortOrder: number
	sections: {
		title: string
		description: string
		sortOrder: number
		images: { url: string; caption: string | null; sortOrder: number }[]
	}[]
	links: { label: string; url: string; sortOrder: number }[]
}

const projects: ProjectInput[] = [
	{
		name: "Recall",
		slug: "recall",
		summary:
			"A spaced repetition flashcard app for iOS. Builds a personal review schedule based on how well you know each card, so you review what matters and skip what you've mastered.",
		icon: "https://picsum.photos/seed/recall-icon/256/256",
		heroImage: "https://picsum.photos/seed/recall-hero/1200/630",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
		role: "Sole developer",
		accentColor: "#4F7EFF",
		isFeatured: true,
		isDiscontinued: false,
		date: "2024",
		sortOrder: 1,
		sections: [
			{
				title: "Overview",
				description:
					"Recall uses the SM-2 spaced repetition algorithm to schedule reviews. After each session, cards you found easy are pushed further into the future; cards you struggled with come back sooner. The result is a review queue that adapts to your actual knowledge rather than a fixed calendar.",
				sortOrder: 1,
				images: [
					{
						url: "https://picsum.photos/seed/recall-1/390/844",
						caption: "Today's review queue",
						sortOrder: 1,
					},
					{
						url: "https://picsum.photos/seed/recall-2/390/844",
						caption: "Card flip animation",
						sortOrder: 2,
					},
				],
			},
			{
				title: "Deck management",
				description:
					"Cards are organised into decks. Decks can be shared as a JSON export, making it easy to import community-made card sets or back up your own. The editor supports Markdown so you can include code snippets, formulas, and images in your cards.",
				sortOrder: 2,
				images: [
					{
						url: "https://picsum.photos/seed/recall-3/390/844",
						caption: "Deck list",
						sortOrder: 1,
					},
					{
						url: "https://picsum.photos/seed/recall-4/390/844",
						caption: "Card editor with Markdown preview",
						sortOrder: 2,
					},
				],
			},
			{
				title: "Statistics",
				description:
					"A stats screen shows your review history, daily streak, retention rate per deck, and a heatmap of activity over the past year. The goal was to make progress visible without turning the app into a gamification machine.",
				sortOrder: 3,
				images: [
					{
						url: "https://picsum.photos/seed/recall-5/390/844",
						caption: "Stats overview",
						sortOrder: 1,
					},
				],
			},
		],
		links: [
			{ label: "App Store", url: "http://localhost:300/about", sortOrder: 1 },
			{
				label: "GitHub",
				url: "https://github.com/rolandleth",
				sortOrder: 2,
			},
		],
	},
	{
		name: "Logbook",
		slug: "logbook",
		summary:
			"A minimal workout tracking app for iOS and Apple Watch. Log sets and reps quickly, track your progression over time, and review your history without the noise of social features.",
		icon: "https://picsum.photos/seed/logbook-icon/256/256",
		heroImage: "https://picsum.photos/seed/logbook-hero/1200/630",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS, PlatformTag.watchOS],
		role: "Sole developer",
		accentColor: "#E84040",
		isFeatured: true,
		isDiscontinued: false,
		date: "2023",
		sortOrder: 2,
		sections: [
			{
				title: "Quick logging",
				description:
					"The main screen is a running workout session. Add an exercise by name, then log sets with a single tap. The watch app mirrors the iOS UI so you can log reps without taking your phone out of your pocket.",
				sortOrder: 1,
				images: [
					{
						url: "https://picsum.photos/seed/logbook-1/390/844",
						caption: "Active session",
						sortOrder: 1,
					},
					{
						url: "https://picsum.photos/seed/logbook-2/390/844",
						caption: "Apple Watch companion",
						sortOrder: 2,
					},
				],
			},
			{
				title: "Progression tracking",
				description:
					"For each exercise, Logbook plots your best set over time as a line chart. You can see the trend across any time window — week, month, or all time. Personal records are highlighted automatically.",
				sortOrder: 2,
				images: [
					{
						url: "https://picsum.photos/seed/logbook-3/390/844",
						caption: "Progression chart for bench press",
						sortOrder: 1,
					},
				],
			},
			{
				title: "Workout history",
				description:
					"Every session is saved with date, duration, total volume, and a breakdown by exercise. You can view a summary or drill into the full session log. Export as CSV for analysis in Numbers or Excel.",
				sortOrder: 3,
				images: [
					{
						url: "https://picsum.photos/seed/logbook-4/390/844",
						caption: "Session history",
						sortOrder: 1,
					},
					{
						url: "https://picsum.photos/seed/logbook-5/390/844",
						caption: "Session detail",
						sortOrder: 2,
					},
				],
			},
		],
		links: [
			{ label: "App Store", url: "http://localhost:300/about", sortOrder: 1 },
		],
	},
	{
		name: "Prism",
		slug: "prism",
		summary:
			"A colour palette generator for macOS. Pick a base colour and generate harmonious palettes using colour theory rules — complementary, triadic, split-complementary, and more.",
		icon: "https://picsum.photos/seed/prism-icon/256/256",
		heroImage: "https://picsum.photos/seed/prism-hero/1200/630",
		bucket: PlatformBucket.Mac,
		platformTags: [PlatformTag.macOS],
		role: "Sole developer",
		accentColor: "#9B59B6",
		isFeatured: false,
		isDiscontinued: false,
		date: "2024",
		sortOrder: 3,
		sections: [
			{
				title: "Palette generation",
				description:
					"Choose a base colour with the native colour picker or paste a hex/HSL value. Prism generates palettes based on the most common colour harmony rules and previews them side-by-side so you can compare at a glance.",
				sortOrder: 1,
				images: [
					{
						url: "https://picsum.photos/seed/prism-1/1280/800",
						caption: "Palette comparison view",
						sortOrder: 1,
					},
				],
			},
			{
				title: "Export",
				description:
					"Export any palette as a CSS custom properties block, a Swift Color extension, a Tailwind config snippet, or a plain JSON array. The export format is configurable so you get output that fits directly into your project.",
				sortOrder: 2,
				images: [
					{
						url: "https://picsum.photos/seed/prism-2/1280/800",
						caption: "Export options",
						sortOrder: 1,
					},
				],
			},
		],
		links: [
			{
				label: "Mac App Store",
				url: "http://localhost:300/about",
				sortOrder: 1,
			},
		],
	},
	{
		name: "Capsule",
		slug: "capsule",
		summary:
			"A journaling app for iOS focused on reducing the friction of writing. Open the app, write, close. No prompts, no moods, no streaks — just a running log of your thoughts.",
		icon: "https://picsum.photos/seed/capsule-icon/256/256",
		heroImage: null,
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
		role: "Sole developer",
		accentColor: "#2ECC71",
		isFeatured: false,
		isDiscontinued: false,
		date: "2025",
		sortOrder: 4,
		sections: [
			{
				title: "Design philosophy",
				description:
					"Most journaling apps add enough ceremony around the act of writing that you end up not writing. Capsule removes everything that isn't the text. The editor takes the full screen, the keyboard comes up immediately, and saving is automatic.",
				sortOrder: 1,
				images: [],
			},
			{
				title: "Search and tags",
				description:
					"Entries can be tagged inline using #hashtags. The search index covers full text so you can find anything you've written, not just titles. Tags give you a fast way to group entries without a formal folder structure.",
				sortOrder: 2,
				images: [
					{
						url: "https://picsum.photos/seed/capsule-1/390/844",
						caption: "Search results",
						sortOrder: 1,
					},
				],
			},
		],
		links: [],
	},
	{
		name: "Frequency",
		slug: "frequency",
		summary:
			"A habit tracker for iOS with no streaks, no notifications, and no social features. Just a simple weekly grid showing which habits you completed and which you didn't.",
		icon: "https://picsum.photos/seed/frequency-icon/256/256",
		heroImage: "https://picsum.photos/seed/frequency-hero/1200/630",
		bucket: PlatformBucket.iOS,
		platformTags: [PlatformTag.iOS],
		role: "Sole developer",
		accentColor: "#F39C12",
		isFeatured: false,
		isDiscontinued: true,
		date: "2022",
		sortOrder: 5,
		sections: [
			{
				title: "Why no streaks?",
				description:
					"Streak-based habit trackers create anxiety around the streak itself rather than the habit. Miss one day and you lose your 90-day streak, which often leads to giving up entirely. Frequency shows a grid — some squares filled, some not — without attaching a number to it.",
				sortOrder: 1,
				images: [
					{
						url: "https://picsum.photos/seed/frequency-1/390/844",
						caption: "Weekly habit grid",
						sortOrder: 1,
					},
					{
						url: "https://picsum.photos/seed/frequency-2/390/844",
						caption: "Habit detail",
						sortOrder: 2,
					},
				],
			},
		],
		links: [],
	},
]

async function main() {
	console.log("Seeding projects...")

	let inserted = 0
	let skipped = 0

	for (const { sections, links, ...projectData } of projects) {
		try {
			await prisma.project.create({
				data: {
					...projectData,
					sections: {
						create: sections.map(({ images, ...sectionData }) => ({
							...sectionData,
							images: {
								create: images,
							},
						})),
					},
					links: {
						create: links,
					},
				},
			})

			inserted++
		} catch (error) {
			console.error(`  Skipped "${projectData.slug}": ${error}`)
			skipped++
		}
	}

	console.log(`Done: ${inserted} inserted, ${skipped} skipped.`)
}

main()
	.catch((e) => {
		console.error(e)
		process.exit(1)
	})
	.finally(() => prisma.$disconnect())
