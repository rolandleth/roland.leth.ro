import type { ProjectPalette, ProjectPaletteTheme } from "@/lib/db/projects"

interface Props {
	accentColor: string | null
	palette: ProjectPalette | null
}

/**
 * One theme's band variables, as CSS declarations. Shared by the product page
 * and the gallery's app tiles (`AppTileStyle`), which wear the same colours.
 */
export function bandDeclarations(theme: ProjectPaletteTheme): string {
	return [
		`--product-band:${theme.band}`,
		`--product-band-surface:${theme.band}`,
		`--product-band-ink:${theme.bandInk}`,
		`--product-band-ink2:${theme.bandInk2}`,
		`--product-band-hi:${theme.bandHighlight}`,
		`--product-accent-text:${theme.accentText}`,
	].join(";")
}

// The header sits over the top of the hero band (the band runs up under it), so
// it takes the band's colour, and its text the band's ink. The header's own
// utilities read these variables (`bg-(--color-header-bg)/90`, `text-primary`,
// `border-border`, `text-(--color-accent)`), so setting them on the header
// element restyles it without the header knowing about the page. Safari tints
// its toolbar from that header background.
function headerRule(theme: ProjectPaletteTheme): string {
	return [
		`--color-header-bg:${theme.band}`,
		`--color-primary-value:${theme.bandInk}`,
		`--color-secondary-value:${theme.bandInk2}`,
		`--color-accent:${theme.bandHighlight}`,
		`--color-border-value:color-mix(in srgb,${theme.bandInk} 14%,transparent)`,
	].join(";")
}

/**
 * The product page's per-project CSS: the accent, the band palette for each
 * theme, and the site header restyled to match the hero. Without a palette the
 * defaults in globals.css apply (an accent tint for the band), and the header
 * takes that tint. A `<style>` block rather than inline styles, because the dark
 * values need the `.dark` ancestor selector and the header is outside the page.
 * It goes when the page does, so leaving for another page restores the header.
 * The page's width and gutter are static, so they live in globals.css.
 *
 * Every value is a hex colour validated by `projectCreateSchema` on the way in,
 * which is what makes writing them into CSS safe.
 */
export default function ProductPageStyle({ accentColor, palette }: Props) {
	const accent = accentColor ?? "var(--color-accent-value)"

	if (palette == null) {
		return (
			<style>
				{`.product-page{--project-accent:${accent}}` +
					`[data-site-header]{--color-header-bg:color-mix(in srgb,${accent} 9%,var(--color-background-value))}`}
			</style>
		)
	}

	return (
		<style>
			{`.product-page{--project-accent:${accent};${bandDeclarations(palette.light)}}` +
				`.dark .product-page{${bandDeclarations(palette.dark)}}` +
				`[data-site-header]{${headerRule(palette.light)}}` +
				`.dark [data-site-header]{${headerRule(palette.dark)}}`}
		</style>
	)
}
