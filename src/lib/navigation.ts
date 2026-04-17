/**
 * Top-level nav entries shared by the persistent `Header` and the landing
 * page's `HomeHero`. Keeping one source of truth so adding a section doesn't
 * require editing two files (and risking drift).
 */
export const navLinks = [
	{ href: "/blog/tech", label: "Blog" },
	{ href: "/projects", label: "Projects" },
	{ href: "/about", label: "About" },
] as const
