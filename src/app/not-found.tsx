import Link from "next/link"
import type { Metadata } from "next"

export const metadata: Metadata = {
	title: "Page not found",
}

export default function NotFound() {
	return (
		<main className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
			<p
				aria-hidden
				className="text-[9rem] leading-none font-bold text-(--color-accent) opacity-10 select-none"
			>
				404
			</p>

			<h1 className="-mt-4 text-3xl font-bold">Page not found</h1>

			<p className="text-secondary mt-3 max-w-xs leading-relaxed">
				The page you&apos;re looking for doesn&apos;t exist or has been moved.
			</p>

			<Link
				href="/"
				className="mt-10 text-sm text-(--color-accent) transition-opacity hover:opacity-75"
			>
				← Back home
			</Link>
		</main>
	)
}
