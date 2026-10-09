import Image from "next/image"

// The fallback letter's size against the icon's: 22px on 56px in the design.
const LETTER_SCALE = 0.4

interface Props {
	name: string
	icon: string | null
	/** Width and height, in pixels. */
	size: number
	/** When the browser fetches the image; Next's default is `lazy`. */
	loading?: "eager" | "lazy"
	className?: string
}

/**
 * A project's app icon on the gallery, rounded like an iOS icon. Without one,
 * the name's first letter on an accent tint. Decorative: every place that shows
 * it also shows the name.
 */
export default function ProjectIcon({
	name,
	icon,
	size,
	loading,
	className = "",
}: Props) {
	if (icon != null) {
		return (
			<Image
				src={icon}
				alt=""
				width={size}
				height={size}
				loading={loading}
				className={`shrink-0 rounded-[23%] ${className}`}
			/>
		)
	}

	return (
		<span
			aria-hidden
			className={`flex shrink-0 items-center justify-center rounded-[23%] bg-(--color-border) font-serif font-medium text-(--color-secondary) ${className}`}
			style={{ width: size, height: size, fontSize: size * LETTER_SCALE }}
		>
			{name.charAt(0)}
		</span>
	)
}
