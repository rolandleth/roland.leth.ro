import type { AnchorHTMLAttributes } from "react"

type Props = AnchorHTMLAttributes<HTMLAnchorElement>

export default function PrivacyLink({ className, children, ...rest }: Props) {
	return (
		<a
			className={`text-accent hover:underline ${className ?? ""}`.trimEnd()}
			{...rest}
		>
			{children}
		</a>
	)
}
