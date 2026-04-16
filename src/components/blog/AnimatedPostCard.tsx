import AnimatedCard from "@/components/AnimatedCard"

interface Props {
	index: number
	children: React.ReactNode
}

export default function AnimatedPostCard({ index, children }: Props) {
	return <AnimatedCard index={index}>{children}</AnimatedCard>
}
