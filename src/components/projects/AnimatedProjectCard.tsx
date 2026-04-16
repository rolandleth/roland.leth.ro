import AnimatedCard from "@/components/AnimatedCard"

interface Props {
	index: number
	children: React.ReactNode
}

export default function AnimatedProjectCard({ index, children }: Props) {
	return (
		<AnimatedCard index={index} delayMultiplier={0.05}>
			{children}
		</AnimatedCard>
	)
}
