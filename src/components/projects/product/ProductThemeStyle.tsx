import type { ProjectPalette, ProjectPaletteTheme } from "@/lib/db/projects"

interface Props {
	accentColor: string | null
	palette: ProjectPalette | null
}

function themeRule(theme: ProjectPaletteTheme): string {
	return [
		`--product-band:${theme.band}`,
		`--product-band-surface:${theme.band}`,
		`--product-band-ink:${theme.bandInk}`,
		`--product-band-ink2:${theme.bandInk2}`,
		`--product-band-hi:${theme.bandHighlight}`,
		`--product-accent-text:${theme.accentText}`,
	].join(";")
}

/**
 * The product page's per-project colours, as CSS custom properties on
 * `.product-page`: the accent, and the band palette for each theme. Without a
 * palette the defaults in globals.css apply (no band behind the hero, an
 * accent-tinted closing). Written as a `<style>` block rather than inline
 * styles because the dark values need the `.dark` ancestor selector.
 *
 * Every value is a hex colour validated by `projectCreateSchema` on the way
 * in, which is what makes writing them into CSS safe.
 */
export default function ProductThemeStyle({ accentColor, palette }: Props) {
	const accent = accentColor ?? "var(--color-accent-value)"
	const light = palette == null ? "" : `;${themeRule(palette.light)}`
	const dark =
		palette == null ? "" : `.dark .product-page{${themeRule(palette.dark)}}`

	return (
		<style>{`.product-page{--project-accent:${accent}${light}}${dark}`}</style>
	)
}
