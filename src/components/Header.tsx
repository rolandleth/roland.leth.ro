"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const navLinks = [
	{ href: "/blog/tech", label: "Blog" },
	{ href: "/projects", label: "Projects" },
	{ href: "/about", label: "About" },
]

export default function Header() {
	const pathname = usePathname()

	// Landing page and the protected admin shell manage their own chrome,
	// so the global header is hidden there to avoid duplicate nav and layout shift.
	const isProtectedAdmin =
		pathname.startsWith("/admin") && pathname !== "/admin/login"

	if (isProtectedAdmin || pathname === "/") {
		return null
	}

	function isActive(href: string): boolean {
		// "/blog/tech" should match "/blog/tech", "/blog/tech/some-post", etc.
		return pathname === href || pathname.startsWith(href + "/")
	}

	return (
		<>
			<header className="border-border fixed top-0 right-0 left-0 z-50 border-b bg-(--color-header-bg)/90 backdrop-blur-xl">
				<nav
					aria-label="Main"
					className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4"
				>
					<Link
						href="/"
						className="text-primary font-semibold transition-opacity hover:opacity-75"
					>
						Roland Leth
					</Link>

					<div className="flex items-center gap-6">
						{navLinks.map(({ href, label }) => (
							<Link
								key={href}
								href={href}
								aria-current={isActive(href) ? "page" : undefined}
								className={`relative py-1.5 text-sm transition-colors hover:text-(--color-accent) ${isActive(href) ? "text-(--color-accent)" : "text-secondary"}`}
							>
								{label}
							</Link>
						))}
					</div>
				</nav>
			</header>

			<div className="h-14" />
		</>
	)
}
