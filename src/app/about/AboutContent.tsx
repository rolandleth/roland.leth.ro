import Image from "next/image"
import Link from "next/link"
import FadeIn from "@/components/about/FadeIn"

const chips = [
	"15+ years",
	"Product & UX focused",
	"Business-driven",
	"Engineering leader",
]

const sections = [
	{
		heading: "Background",
		paragraphs: [
			`Software development has been my craft for over a decade. I started
			with iOS and gradually expanded into full-stack web development, always
			with a strong focus on product quality and user experience.`,
			`Beyond writing code, I care about building things that matter — apps
			and tools that solve real problems in ways that feel effortless to use.`,
		],
	},
	{
		heading: "This blog",
		paragraphs: [
			`The tech section is where I write about software development, iOS, Swift,
			web technologies, and the craft of building products.`,
			`The life section is about personal development — habits, identity change,
			motivation, and improving ourselves. Most of it comes from my own experiences
			or from the books I read.`,
		],
	},
]

const contactLinks = [
	{
		label: "Email",
		href: "mailto:roland+hi@leth.ro",
	},
	{
		label: "Twitter",
		href: "https://twitter.com/rolandleth",
	},
	{
		label: "Résumé",
		href: "/resume.pdf",
		download: true,
	},
]

// Stagger math for section fade-ins: each section appears slightly after the
// previous one, offset from the intro block which lands at 0.1s.
const SECTION_BASE_DELAY = 0.1
const SECTION_STAGGER = 0.06

export default function AboutContent() {
	return (
		<div className="flex flex-col items-center gap-10 sm:flex-row sm:items-start sm:gap-12">
			<FadeIn
				as="aside"
				delay={0}
				className="flex shrink-0 gap-16 text-center sm:sticky sm:top-8 sm:w-48 sm:flex-col sm:items-start sm:gap-5 sm:text-left"
			>
				<div className="flex flex-col items-center gap-5 sm:items-start">
					<Image
						src="/images/mypic.jpg"
						alt="Roland Leth"
						width={96}
						height={96}
						className="rounded-full object-cover ring-2 ring-(--color-border)"
						priority
					/>

					<div>
						<p className="text-primary font-semibold">Roland Leth</p>
						<p className="text-secondary mt-0.5 text-sm">
							iOS developer &amp; <br />
							full-stack engineer
						</p>
					</div>
				</div>

				<div className="flex flex-col items-center gap-5 sm:items-start">
					<div className="flex flex-col items-center gap-2 sm:items-start">
						{chips.map((chip) => (
							<span
								key={chip}
								className="rounded-full bg-(--color-border) px-2.5 py-0.5 text-xs font-medium text-(--color-accent)"
							>
								{chip}
							</span>
						))}
					</div>

					<div className="flex flex-col gap-2">
						{contactLinks.map(({ label, href, download }) => (
							<Link
								key={label}
								href={href}
								download={download}
								className="text-secondary hover:text-accent text-sm transition-colors duration-300"
							>
								{label} →
							</Link>
						))}
					</div>
				</div>
			</FadeIn>

			<div className="min-w-0 flex-1 space-y-10">
				<FadeIn as="h1" delay={0.06} className="text-3xl font-bold">
					About
				</FadeIn>

				<FadeIn as="section" delay={SECTION_BASE_DELAY}>
					<div className="space-y-4">
						<p className="text-secondary leading-relaxed">
							I&apos;m an iOS developer since 2011, with extensive full-stack
							knowledge, placing myself at the crossroads of product, business,
							and user experience, balancing all three to create successful
							products.
						</p>
						<p className="text-secondary leading-relaxed">
							In the past year I&apos;ve shifted to building products primarily
							by directing AI agents: they design the UI and write the code,
							while I review their output and own the architecture, the call on
							what ships, and the security boundaries they operate within,
							shipping three complex projects to date.
						</p>
						<p className="text-secondary leading-relaxed">
							I&apos;ve worked on my own projects, on remote teams, as a
							freelancer and contractor, in{" "}
							<a href="https://db.com">big corporations</a>, or led teams at big
							companies like
							<a href="https://deindeal.ch/">DeinDeal</a>—part of{" "}
							<a href="https://ringier.ch/">Ringier</a>—or{" "}
							<a href="https://therme.media/">Therme Media</a>—part of{" "}
							<a href="https://thermegroup.com/">Therme Group</a>. I also
							started my own software company, and co-founded startups like{" "}
							<a href="https://eventa.rsvp/">Eventa</a> and{" "}
							<a href="https://qality.tech/">Qality Tech</a>. In addition, I
							contribute to{" "}
							<a href="https://github.com/rolandleth">open source</a>{" "}
							(occasionally) and publish articles on
							<a href="https://roland.leth.ro">this blog</a>.
						</p>
					</div>
				</FadeIn>

				{sections.map((section, i) => (
					<FadeIn
						key={section.heading}
						as="section"
						delay={SECTION_BASE_DELAY + (i + 1) * SECTION_STAGGER}
					>
						<h2 className="mb-3 text-xl font-semibold">{section.heading}</h2>

						<div className="space-y-4">
							{section.paragraphs.map((paragraph, j) => (
								<p key={j} className="text-secondary leading-relaxed">
									{paragraph}
								</p>
							))}
						</div>
					</FadeIn>
				))}
			</div>
		</div>
	)
}
