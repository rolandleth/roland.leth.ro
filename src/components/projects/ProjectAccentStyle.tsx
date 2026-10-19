interface Props {
	accentColor: string | null
}

/**
 * Tints the site header with the project's accent. The header gradient in
 * globals.css reads `--color-header-accent`; rendering the rule here (instead
 * of a `useEffect` on mount) puts the override in the first paint, so moving
 * between project pages doesn't flash through the default accent between one
 * page's cleanup and the next one's effect. The tabbed layout's
 * (`ProjectContent`); the product page tints the header in `ProductPageStyle`.
 *
 * `accentColor` is a validated hex (`projectCreateSchema` on write, and
 * `getProjectBySlug` again on read), which is what makes writing it into CSS
 * safe.
 */
export default function ProjectAccentStyle({ accentColor }: Props) {
	if (accentColor == null) {
		return null
	}

	return <style>{`:root { --color-header-accent: ${accentColor}; }`}</style>
}
