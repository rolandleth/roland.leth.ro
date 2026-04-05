/**
 * Subtle accent glow at the top of content pages. Fixed so it extends behind
 * the nav bar and spans full viewport width regardless of content max-width.
 */
export default function PageGlow() {
	return (
		<div
			aria-hidden
			className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-48 opacity-[0.11] dark:opacity-[0.09]"
			style={{
				background:
					"radial-gradient(ellipse 60% 100% at 50% 0%, var(--color-accent-value), transparent)",
			}}
		/>
	)
}
