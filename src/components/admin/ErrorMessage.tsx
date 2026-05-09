interface Props {
	children: React.ReactNode
	/** `sm` = text-xs (used in inline contexts like sort-order/featured toggle); `md` = text-sm (default, used in form-level errors). */
	size?: "sm" | "md"
	/** Additional layout classes. Useful when the error needs to span a wider container (e.g. AdminNav). */
	className?: string
}

/**
 * Standardised error surface for admin forms and toggles. Carries `role="alert"`
 * so screen readers announce the message on insertion. Centralised here so any
 * future a11y refinement (e.g. adding an icon, a dismiss button, or a
 * different live-region strategy) lands in one place.
 */
export default function ErrorMessage({
	children,
	size = "md",
	className,
}: Props) {
	const sizeClass = size === "sm" ? "text-xs" : "text-sm"
	const extraClass = className ? ` ${className}` : ""

	return (
		<p role="alert" className={`${sizeClass} text-red-500${extraClass}`}>
			{children}
		</p>
	)
}
