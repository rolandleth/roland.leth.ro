import { ImageResponse } from "next/og"

// A design tool, not a production endpoint: renders the site-wide social card
// so it can be re-generated and downloaded after a copy or palette change. What
// actually ships is the committed PNG at `defaultOgImage`
// (`src/lib/content/metadata.ts`) — a static file costs no render, depends on no
// font CDN, and can't change shape under a Satori upgrade.
//
// To refresh the card: run the dev server, open `/og`, save the image over the
// committed one.
//
// 404s in production. It renders the same bytes either way, so serving it live
// would be a second, slower source of truth for the same image, drifting from
// the committed file the moment one of them is regenerated.

// Sampled from `globals.css`'s `.dark` block. Duplicated as literals because
// Satori resolves no CSS variables and reads no stylesheet — if the palette
// moves, these move with it by hand.
const BACKGROUND = "#030712"
const PRIMARY = "#f5f5f5"
const SECONDARY = "#9ca3af"
const ACCENT = "#12a8da"

const WIDTH = 1200
const HEIGHT = 630

const NAME = "Roland Leth"
const TAGLINE = "iOS developer & full-stack engineer"
const DOMAIN = "roland.leth.ro"

/**
 * Fetches a Google font as raw bytes for Satori, which takes font data rather
 * than a family name and supports no woff2 — hence the old `User-Agent`, which
 * is what makes the CSS endpoint hand back a TrueType `src` instead.
 *
 * `text` subsets the file to the glyphs this card actually draws, which is the
 * difference between a few KB and a few hundred.
 *
 * Throws on any failure rather than falling back to Satori's default typeface.
 * The output of this route gets saved and committed, so a silent fallback would
 * hand back a card in the wrong font that looks deliberate — worse than an error
 * on a page only ever opened on purpose. No response caching either: nothing
 * here runs in production, and a dev-only tool re-fetching a few KB is cheaper
 * than reasoning about a stale subset after a copy edit.
 */
async function loadGoogleFont(
	family: string,
	weight: number,
	text: string
): Promise<ArrayBuffer> {
	const params = new URLSearchParams({
		family: `${family}:wght@${weight}`,
		text,
	})

	const cssResponse = await fetch(
		`https://fonts.googleapis.com/css2?${params}`,
		{ headers: { "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64)" } }
	)

	if (!cssResponse.ok) {
		throw new Error(`[og] ${family} ${weight}: css ${cssResponse.status}`)
	}

	const css = await cssResponse.text()
	// Plain capture group, not a named one: the `tsconfig` target predates ES2018.
	const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/.exec(
		css
	)?.[1]

	if (url === undefined) {
		throw new Error(`[og] ${family} ${weight}: no truetype src in css`)
	}

	const fontResponse = await fetch(url)

	if (!fontResponse.ok) {
		throw new Error(`[og] ${family} ${weight}: file ${fontResponse.status}`)
	}

	return await fontResponse.arrayBuffer()
}

export async function GET() {
	if (process.env.NODE_ENV === "production") {
		return new Response("Not found", { status: 404 })
	}

	// Newsreader for the name and Inter for everything else, matching
	// `globals.css`: headings take `--font-heading` (Newsreader), body copy takes
	// `--font-body` (Inter).
	const [newsreader, inter] = await Promise.all([
		loadGoogleFont("Newsreader", 700, NAME),
		loadGoogleFont("Inter", 400, TAGLINE + DOMAIN),
	])

	const fonts = [
		{
			name: "Newsreader",
			data: newsreader,
			weight: 700 as const,
			style: "normal" as const,
		},
		{
			name: "Inter",
			data: inter,
			weight: 400 as const,
			style: "normal" as const,
		},
	]

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
				background: BACKGROUND,
				padding: "0 96px",
				position: "relative",
			}}
		>
			{/* Echoes the landing page's accent blobs. Painted across the whole
				    canvas rather than inside a sized box: a box's own edge shows up as
				    a hard seam wherever the fade hasn't finished. `rgba`, not
				    `#rrggbbaa` — Satori doesn't parse 8-digit hex, and silently
				    renders the near-solid colour instead of the fade. */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: WIDTH,
					height: HEIGHT,
					background: `radial-gradient(circle at 78% 8%, rgba(18, 168, 218, 0.26) 0%, rgba(18, 168, 218, 0.09) 38%, rgba(18, 168, 218, 0) 68%)`,
				}}
			/>

			<div
				style={{
					display: "flex",
					width: 64,
					height: 6,
					borderRadius: 3,
					background: ACCENT,
					marginBottom: 40,
				}}
			/>

			<div
				style={{
					display: "flex",
					fontFamily: "Newsreader",
					fontSize: 92,
					fontWeight: 700,
					color: PRIMARY,
					letterSpacing: "-0.02em",
				}}
			>
				{NAME}
			</div>

			<div
				style={{
					display: "flex",
					fontFamily: "Inter",
					fontSize: 40,
					color: SECONDARY,
					marginTop: 24,
				}}
			>
				{TAGLINE}
			</div>

			<div
				style={{
					display: "flex",
					fontFamily: "Inter",
					fontSize: 28,
					color: ACCENT,
					marginTop: 56,
				}}
			>
				{DOMAIN}
			</div>
		</div>,
		{ width: WIDTH, height: HEIGHT, fonts }
	)
}
