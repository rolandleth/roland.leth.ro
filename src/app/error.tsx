"use client"

import Link from "next/link"
import { useEffect } from "react"

interface Props {
	error: Error
	reset: () => void
}

export default function InlineError({ error, reset }: Props) {
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.error("[app:error]", error)
	}, [error])

	return (
		<div className="mx-auto flex max-w-4xl flex-1 flex-col items-center justify-center px-4 py-12 text-center">
			<p
				aria-hidden
				className="text-[9rem] leading-none font-bold text-(--color-accent) opacity-10 select-none"
			>
				500
			</p>

			<h1 className="-mt-4 text-3xl font-bold">Something went wrong</h1>

			<p className="text-secondary mt-3 max-w-sm leading-relaxed">
				An unexpected error interrupted the page. Try again, or head back home.
			</p>

			<div className="mt-10 flex items-center gap-6 text-sm">
				<button
					type="button"
					onClick={reset}
					className="cursor-pointer text-(--color-accent) transition-opacity hover:opacity-75"
				>
					Try again
				</button>

				<Link
					href="/"
					className="text-(--color-accent) transition-opacity hover:opacity-75"
				>
					← Back home
				</Link>
			</div>
		</div>
	)
}
