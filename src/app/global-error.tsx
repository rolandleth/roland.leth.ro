"use client"

import { useEffect } from "react"

interface Props {
	error: Error
	reset: () => void
}

// Fires only when the root layout itself throws, so the layout's chrome and
// `globals.css` are unavailable — inline styles keep the fallback readable
// without depending on stylesheet load.
export default function GlobalError({ error, reset }: Props) {
	useEffect(() => {
		// eslint-disable-next-line no-console
		console.error("[app:global-error]", error)
	}, [error])

	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					padding: "2rem",
					fontFamily: "system-ui, sans-serif",
					textAlign: "center",
				}}
			>
				<div>
					<h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
						Something went wrong
					</h1>

					<p style={{ marginBottom: "1.5rem", opacity: 0.7 }}>
						An unexpected error interrupted the application.
					</p>

					<button
						type="button"
						onClick={reset}
						style={{
							padding: "0.5rem 1rem",
							border: "1px solid currentColor",
							borderRadius: "0.25rem",
							background: "transparent",
							color: "inherit",
							cursor: "pointer",
						}}
					>
						Try again
					</button>
				</div>
			</body>
		</html>
	)
}
