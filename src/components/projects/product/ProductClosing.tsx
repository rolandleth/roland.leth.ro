import Image from "next/image"
import ProjectLinkCta from "../ProjectLinkCta"
import type { StoreLink } from "./ProductHero"

interface Props {
	name: string
	icon: string | null
	headline: string | null
	body: string | null
	storeLinks: readonly StoreLink[]
	storeNote: string | null
}

/**
 * The end of an own-app page: the same band as the hero (an accent tint when
 * the project has no palette), the store button again, and the closing lines.
 * Without a closing headline the `h2` is the app's name, rather than words
 * the copy didn't supply.
 */
export default function ProductClosing({
	name,
	icon,
	headline,
	body,
	storeLinks,
	storeNote,
}: Props) {
	return (
		<section
			id="get"
			aria-labelledby="get-title"
			className="product-band scroll-mt-4 bg-(--product-band-surface) text-(--product-band-ink)"
		>
			<div className="product-frame flex flex-col items-center py-20 text-center lg:pt-[88px] lg:pb-24">
				{icon != null && (
					<Image
						src={icon}
						alt=""
						width={64}
						height={64}
						className="rounded-[23%] shadow-sm"
					/>
				)}

				{headline != null && (
					<p className="mt-4 text-[15px] font-semibold text-(--product-band-ink2)">
						{name}
					</p>
				)}

				<h2
					id="get-title"
					className="mt-2.5 font-serif text-[40px] leading-[1.05] font-normal tracking-[-0.02em] text-balance sm:text-[52px]"
				>
					{headline ?? name}
				</h2>

				{body != null && (
					<p className="mt-3.5 max-w-[30em] text-lg leading-relaxed text-pretty text-(--product-band-ink2) sm:text-[19px]">
						{body}
					</p>
				)}

				{storeLinks.length > 0 && (
					<div className="mt-8 flex flex-wrap items-center justify-center gap-3">
						{storeLinks.map(({ link, cta }) => (
							<ProjectLinkCta
								key={link.id}
								url={link.url}
								cta={cta}
								accent="var(--product-band-hi)"
							/>
						))}
					</div>
				)}

				{storeNote != null && storeLinks.length > 0 && (
					<p className="mt-3 text-sm text-(--product-band-ink2)">{storeNote}</p>
				)}
			</div>
		</section>
	)
}
