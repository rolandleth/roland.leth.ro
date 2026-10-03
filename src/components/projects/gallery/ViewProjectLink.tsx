import Link from "next/link"

interface Props {
	slug: string
	name: string
	/** The underline's colour, as a Tailwind `decoration-*` class. */
	decorationClassName: string
}

/**
 * "View project →" to a project's page, on every gallery tile and card. The
 * project's name is in the link for screen readers ("View Reckon project"), so
 * a list of them doesn't read as several identical links.
 *
 * The text sits in one span inside the link: as flex items of their own, the
 * words and the arrow each got their own underline, broken at every space.
 * The link stays a flex box only to keep its 44px touch height.
 */
export default function ViewProjectLink({
	slug,
	name,
	decorationClassName,
}: Props) {
	return (
		<Link
			href={`/projects/${slug}`}
			className="inline-flex min-h-11 items-center text-[15px] font-medium"
		>
			<span
				className={`underline decoration-[1.5px] underline-offset-[5px] ${decorationClassName}`}
			>
				View<span className="sr-only"> {name}</span> project{" "}
				<span aria-hidden>→</span>
			</span>
		</Link>
	)
}
