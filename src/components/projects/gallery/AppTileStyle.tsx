import { bandDeclarations } from "../product/ProductPageStyle"
import type { ProjectGalleryItem } from "@/lib/db/projects"

interface Props {
	apps: readonly Pick<ProjectGalleryItem, "slug" | "accentColor" | "palette">[]
}

/**
 * The colours of every app tile on the gallery: each tile wears its product
 * page's band palette, in each theme, and its accent. One `<style>` block for
 * all of them, since the dark values need the `.dark` ancestor selector, which
 * inline styles can't express. A tile without a palette or an accent keeps the
 * `.app-tile` defaults in globals.css.
 *
 * Each rule targets its tile by `data-app-tile`, the project's slug. Slugs are
 * lowercase letters, digits and hyphens, and the colours are hex values, both
 * validated by `projectCreateSchema` on the way in, which is what makes writing
 * them into CSS safe.
 */
export default function AppTileStyle({ apps }: Props) {
	const css = apps
		.map(({ slug, accentColor, palette }) => {
			const selector = `[data-app-tile="${slug}"]`
			const accent =
				accentColor == null ? "" : `--project-accent:${accentColor};`

			if (palette == null) {
				return accent === "" ? "" : `${selector}{${accent}}`
			}

			return (
				`${selector}{${accent}${bandDeclarations(palette.light)}}` +
				`.dark ${selector}{${bandDeclarations(palette.dark)}}`
			)
		})
		.join("")

	return css === "" ? null : <style>{css}</style>
}
