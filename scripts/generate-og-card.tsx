// Regenerates the site-wide social card at `public/images/og-card.png` — the
// asset `defaultOgImage` (`src/lib/content/metadata.ts`) points every page at.
//
//   yarn og:card              # write public/images/og-card.png
//   yarn og:card --check      # render and compare, write nothing (exit 1 on drift)
//
// A build-time script, not a route. This renders the same bytes on every run, so
// serving it live would be a second, slower source of truth for one image, and
// the route form shipped a Satori + resvg WASM payload to production to serve a
// 404 string. Run it after a copy or palette change and commit the result.
//
// The palette below is sampled from `globals.css`'s `.dark` block. Satori
// resolves no CSS variables and reads no stylesheet, so these are literals — if
// the palette moves, they move with it by hand. `--check` is what makes that
// drift visible: wire it into CI and a palette edit that skips this script
// fails there instead of leaving the live card on the old colours indefinitely.

import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { ImageResponse } from "next/og"
import {
	OG_CARD_NAME,
	OG_CARD_TAGLINE,
	OG_IMAGE_HEIGHT,
	OG_IMAGE_WIDTH,
} from "@/lib/content/metadata"

const BACKGROUND = "#030712"
const PRIMARY = "#f5f5f5"
const SECONDARY = "#9ca3af"
const ACCENT = "#12a8da"

// Imported rather than restated: `buildPageMetadata` advertises these as
// `og:image:width`/`height`, and a card rendered at a different size would
// contradict its own markup on every page.
const WIDTH = OG_IMAGE_WIDTH
const HEIGHT = OG_IMAGE_HEIGHT

// Imported for the same reason as the dimensions: `defaultOgImageDescriptor`
// builds its `alt` from these two, and `--check` compares PNG bytes, so a copy
// change made here alone would leave every shared link described by the old
// tagline with nothing to catch it.
const NAME = OG_CARD_NAME
const TAGLINE = OG_CARD_TAGLINE
const DOMAIN = "roland.leth.ro"

/** Bounds a hung connection, which would otherwise stall the run with no error. */
const FETCH_TIMEOUT_MS = 15_000

const OUTPUT_PATH = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	"..",
	"public",
	"images",
	"og-card.png"
)

/**
 * Fetches a Google font as raw bytes for Satori, which takes font data rather
 * than a family name and supports no woff2 — hence the old `User-Agent`, which
 * is what makes the CSS endpoint hand back a TrueType `src` instead.
 *
 * Throws on any failure rather than falling back to Satori's default typeface.
 * The output gets committed, so a silent fallback would hand back a card in the
 * wrong font that looks deliberate.
 *
 * No `text` subsetting. The route form subset each file to the glyphs the card
 * draws, which coupled the subset by hand to the JSX literals below — add a
 * word and its glyphs vanish with no error. Subsetting only shrinks the
 * download, never the render, and a script run on demand has no reason to care
 * about a few hundred KB.
 */
async function loadGoogleFont(
	family: string,
	weight: number
): Promise<ArrayBuffer> {
	const params = new URLSearchParams({ family: `${family}:wght@${weight}` })

	const css = await fetchText(
		`https://fonts.googleapis.com/css2?${params}`,
		`${family} ${weight} css`,
		{ "User-Agent": "Mozilla/5.0 (Windows NT 6.1; WOW64)" }
	)

	// Plain capture group, not a named one: the `tsconfig` target predates ES2018.
	const url = /src: url\(([^)]+)\) format\('(?:truetype|opentype)'\)/.exec(
		css
	)?.[1]

	if (url === undefined) {
		throw new Error(
			`[og] ${family} ${weight}: no truetype src in the Google Fonts CSS. ` +
				`The response shape likely changed; the regex in this file needs updating.`
		)
	}

	return await fetchBytes(url, `${family} ${weight} file`)
}

/**
 * `fetch` with a timeout and a labelled error.
 *
 * The label matters: a bare `fetch` rejects on the likeliest failures (offline,
 * DNS, TLS) with a `TypeError` naming neither the request nor which font it was
 * for — the one path with no context is the one most likely to be hit.
 */
async function fetchLabelled(
	url: string,
	label: string,
	headers?: Record<string, string>
): Promise<Response> {
	let response: Response

	try {
		response = await fetch(url, {
			headers,
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		})
	} catch (cause) {
		throw new Error(`[og] ${label}: request failed (${url})`, { cause })
	}

	if (!response.ok) {
		throw new Error(`[og] ${label}: HTTP ${response.status} (${url})`)
	}

	return response
}

async function fetchText(
	url: string,
	label: string,
	headers?: Record<string, string>
): Promise<string> {
	return await (await fetchLabelled(url, label, headers)).text()
}

async function fetchBytes(url: string, label: string): Promise<ArrayBuffer> {
	return await (await fetchLabelled(url, label)).arrayBuffer()
}

/** Renders the card to PNG bytes. */
async function renderCard(): Promise<Uint8Array> {
	// Newsreader for the name and Inter for everything else, matching
	// `globals.css`: headings take `--font-heading` (Newsreader), body copy takes
	// `--font-body` (Inter).
	const [newsreader, inter] = await Promise.all([
		loadGoogleFont("Newsreader", 700),
		loadGoogleFont("Inter", 400),
	])

	const response = new ImageResponse(
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
		{
			width: WIDTH,
			height: HEIGHT,
			fonts: [
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
			],
		}
	)

	return new Uint8Array(await response.arrayBuffer())
}

async function main(): Promise<void> {
	const isCheck = process.argv.includes("--check")
	const bytes = await renderCard()

	if (isCheck) {
		const committed = await readFile(OUTPUT_PATH).catch(() => null)

		if (committed === null) {
			throw new Error(`[og] --check: ${OUTPUT_PATH} is missing`)
		}

		// Hash comparison, not a byte diff: the message only needs to say whether
		// they match, and two digests are readable in a CI log.
		const rendered = createHash("sha256").update(bytes).digest("hex")
		const onDisk = createHash("sha256").update(committed).digest("hex")

		if (rendered !== onDisk) {
			throw new Error(
				`[og] --check: the committed card is stale.\n` +
					`  rendered: ${rendered}\n` +
					`  on disk:  ${onDisk}\n` +
					`  Run \`yarn og:card\` and commit the result.`
			)
		}

		console.log(`[og] --check: og-card.png matches (${rendered.slice(0, 12)})`)

		return
	}

	await writeFile(OUTPUT_PATH, bytes)

	console.log(
		`[og] wrote ${OUTPUT_PATH} (${WIDTH}×${HEIGHT}, ${bytes.length} bytes)`
	)
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error)

	if (error instanceof Error && error.cause !== undefined) {
		console.error("  cause:", error.cause)
	}

	process.exit(1)
})
