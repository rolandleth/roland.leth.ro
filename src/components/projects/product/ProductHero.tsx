import Image from "next/image"
import ProjectLinkCta from "../ProjectLinkCta"
import type { LinkCta } from "@/lib/utils/platforms"

export interface StoreLink {
	link: { id: number; url: string }
	cta: LinkCta
}

interface Props {
	name: string
	icon: string | null
	eyebrow: string | null
	headline: string | null
	summary: string
	heroImage: string | null
	heroImageAlt: string | null
	isDiscontinued: boolean
	storeLinks: readonly StoreLink[]
	/** The id of the section with numbered steps, for "See how it works". */
	stepsAnchor: string | null
	storeNote: string | null
}

/**
 * The top of an own-app page, on the band colour (the palette's, or an accent
 * tint). One `h1` holds the name, the eyebrow and the headline, joined for
 * screen readers and text extraction by visually hidden ": " and ". ", so it
 * reads "Digest: Food and symptom journal for iPhone and iPad. Find which
 * foods to suspect" instead of three words run together.
 *
 * With neither an eyebrow nor a headline, the name itself takes the headline
 * size. With a hero image, text and image sit side by side from 1024px; the
 * image is the one picture on the page that loads with `priority`.
 */
export default function ProductHero({
	name,
	icon,
	eyebrow,
	headline,
	summary,
	heroImage,
	heroImageAlt,
	isDiscontinued,
	storeLinks,
	stepsAnchor,
	storeNote,
}: Props) {
	const isBare = eyebrow == null && headline == null
	const iconSize = isBare ? 64 : 44

	// The band runs up under the fixed site header: `-mt-14` pulls it over the
	// header's 3.5rem spacer, and the top padding adds the same back so the text
	// starts below the bar. `ProductPageStyle` gives the header the band colour.
	//
	// From 1280px the frame is at its full width, and the image takes a larger
	// share (about 600px against 460px of text) and a smaller gap. Below that,
	// the two split about evenly, so a 66px headline keeps room for its words.
	return (
		<section className="product-band -mt-14 bg-(--product-band) text-(--product-band-ink)">
			<div
				className={`product-frame grid items-center gap-12 pt-[7.5rem] pb-20 lg:gap-16 lg:pt-[calc(88px+3.5rem)] lg:pb-24 ${
					heroImage == null
						? ""
						: "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] xl:gap-12"
				}`}
			>
				<div className="product-hero-fade min-w-0">
					<h1 className="flex flex-col gap-4 font-normal">
						<span
							className={`flex items-center font-serif leading-none tracking-[-0.015em] ${
								isBare
									? "gap-4 text-[44px] sm:text-[56px] lg:text-[64px]"
									: "gap-3.5 text-2xl font-medium"
							}`}
						>
							{icon == null ? null : (
								<Image
									src={icon}
									alt=""
									width={iconSize}
									height={iconSize}
									loading="eager"
									className="shrink-0 rounded-[23%] shadow-sm"
								/>
							)}
							{name}
						</span>

						{eyebrow == null ? null : (
							<>
								<span className="sr-only">: </span>
								<span className="font-serif text-xl leading-snug text-(--product-band-hi) italic sm:text-[21px]">
									{eyebrow}
								</span>
							</>
						)}

						{headline == null ? null : (
							<>
								<span className="sr-only">{eyebrow == null ? ": " : ". "}</span>
								<span className="font-serif text-[40px] leading-[1.04] tracking-[-0.025em] text-balance sm:text-[52px] lg:text-[66px]">
									{headline}
								</span>
							</>
						)}
					</h1>

					{isDiscontinued && (
						<p className="mt-4 inline-block rounded-full border border-current/20 px-2.5 py-0.5 text-xs font-medium text-(--product-band-ink2)">
							Discontinued
						</p>
					)}

					<p className="mt-6 max-w-[34em] text-lg leading-relaxed text-pretty text-(--product-band-ink2) sm:text-[19px]">
						{summary}
					</p>

					{(storeLinks.length > 0 || stepsAnchor != null) && (
						<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
							{storeLinks.map(({ link, cta }) => (
								<ProjectLinkCta
									key={link.id}
									url={link.url}
									cta={cta}
									accent="var(--product-band-hi)"
								/>
							))}

							{stepsAnchor != null && (
								<a
									href={`#${stepsAnchor}`}
									className="inline-flex min-h-11 items-center text-[15px] font-medium underline decoration-(--product-band-hi) decoration-[1.5px] underline-offset-[5px]"
								>
									See how it works
								</a>
							)}
						</div>
					)}

					{storeNote != null && storeLinks.length > 0 && (
						<p className="mt-3 text-sm text-(--product-band-ink2)">
							{storeNote}
						</p>
					)}
				</div>

				{heroImage != null && (
					<figure className="product-hero-fade m-0 min-w-0">
						<div className="product-shot relative aspect-[1270/760] overflow-hidden rounded-[14px]">
							<Image
								src={heroImage}
								alt={heroImageAlt ?? `${name} screenshot`}
								fill
								priority
								sizes="(min-width: 1024px) 600px, calc(100vw - 2rem)"
								className="object-cover"
							/>
						</div>
					</figure>
				)}
			</div>
		</section>
	)
}
