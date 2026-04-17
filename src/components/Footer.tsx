import Link from "next/link"
import FooterYear from "./FooterYear"
import ThemeToggle from "./ThemeToggle"

export default function Footer() {
	return (
		<footer className="border-border relative mt-auto border-t">
			<div className="text-secondary mx-auto flex max-w-4xl flex-col items-center gap-4 px-4 py-6 text-center text-sm">
				<div className="flex items-center gap-5">
					<span>
						&copy; <span className="hidden sm:inline">2013 &ndash; </span>
						<FooterYear initialYear={new Date().getFullYear()} />
					</span>
					<Link
						href="/blog/tech/archive"
						className="transition-colors hover:text-(--color-accent)"
					>
						Archive
					</Link>
					<span aria-hidden className="h-3 w-px bg-(--color-border)" />
					<a
						href="https://github.com/rolandleth"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-(--color-accent)"
					>
						GitHub
					</a>
					<a
						href="https://linkedin.com/in/rolandleth"
						target="_blank"
						rel="noopener noreferrer"
						className="transition-colors hover:text-(--color-accent)"
					>
						LinkedIn
					</a>
				</div>
				<div className="absolute top-1/2 right-4 -translate-y-1/2">
					<ThemeToggle />
				</div>
			</div>
		</footer>
	)
}
