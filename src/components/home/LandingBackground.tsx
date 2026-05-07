const blobs = [
	{
		position: "-top-32 -left-32",
		size: "h-80 w-80",
		blur: "blur-[100px]",
		animation: "blob1 32s ease-in-out infinite",
	},
	{
		position: "top-1/4 right-2/7",
		size: "h-72 w-72",
		blur: "blur-[80px]",
		animation: "blob2 24s ease-in-out infinite",
	},
	{
		position: "-right-32 -bottom-32",
		size: "h-108 w-108",
		blur: "blur-[120px]",
		animation: "blob3 36s ease-in-out infinite",
	},
]

export default function LandingBackground() {
	return (
		<div aria-hidden className="pointer-events-none fixed inset-0">
			{blobs.map(({ position, size, blur, animation }) => (
				<div
					key={animation}
					data-blob-bg
					className={`bg-accent absolute rounded-full ${position} ${size} ${blur}`}
					style={{ animation, willChange: "transform" }}
				/>
			))}
		</div>
	)
}
