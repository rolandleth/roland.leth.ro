type HeadingLevel = 1 | 2 | 3

interface Props {
	title: string
	headingLevel?: HeadingLevel
	children: React.ReactNode
}

export default function PrivacySection({
	title,
	headingLevel = 2,
	children,
}: Props) {
	const Heading = `h${headingLevel}` as const
	const headingClass =
		headingLevel === 1
			? "mb-10 text-3xl font-bold"
			: "mb-3 text-xl font-semibold"

	return (
		<section>
			<Heading className={headingClass}>{title}</Heading>
			{/* `legal-content`: globals.css styles every link inside it as a text
			    link, so section content needs no per-link class. */}
			<div className="legal-content text-secondary space-y-4 leading-relaxed">
				{children}
			</div>
		</section>
	)
}
