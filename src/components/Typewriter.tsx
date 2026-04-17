"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect } from "react"

interface Props {
	phrases: string[]
	/** Delay in ms between each character typed. */
	typeSpeed?: number
	/** Delay in ms between each character erased. */
	eraseSpeed?: number
	/** Pause in ms after a phrase is fully typed before erasing begins. */
	pauseAfterType?: number
	/** Pause in ms after a phrase is fully erased before the next one starts. */
	pauseAfterErase?: number
	className?: string
}

type Phase = "typing" | "erasing"

export default function Typewriter({
	phrases,
	typeSpeed = 80,
	eraseSpeed = 50,
	pauseAfterType = 1800,
	pauseAfterErase = 400,
	className,
}: Props) {
	const [phraseIndex, setPhraseIndex] = useState(0)
	const [displayedText, setDisplayedText] = useState("")
	const [phase, setPhase] = useState<Phase>("typing")

	const currentPhrase = phrases[phraseIndex]

	useEffect(() => {
		// Each branch schedules exactly one timer. When a phase is complete, the
		// same branch schedules the pause-then-transition timer directly instead
		// of calling `setPhase` synchronously (which would cascade renders and
		// trip `react-hooks/set-state-in-effect`).
		switch (phase) {
			case "typing": {
				if (displayedText.length < currentPhrase.length) {
					const timeout = setTimeout(() => {
						setDisplayedText(currentPhrase.slice(0, displayedText.length + 1))
					}, typeSpeed)

					return () => clearTimeout(timeout)
				}

				// End of typing: pause before flipping into erasing.
				const timeout = setTimeout(() => setPhase("erasing"), pauseAfterType)

				return () => clearTimeout(timeout)
			}

			case "erasing": {
				if (displayedText.length > 0) {
					const timeout = setTimeout(() => {
						setDisplayedText(displayedText.slice(0, -1))
					}, eraseSpeed)

					return () => clearTimeout(timeout)
				}

				// End of erasing: pause, then advance to the next phrase.
				const timeout = setTimeout(() => {
					setPhraseIndex((prev) => (prev + 1) % phrases.length)
					setPhase("typing")
				}, pauseAfterErase)

				return () => clearTimeout(timeout)
			}
		}
	}, [
		phase,
		displayedText,
		currentPhrase,
		typeSpeed,
		eraseSpeed,
		pauseAfterType,
		pauseAfterErase,
		phrases.length,
	])

	return (
		<span className={className} aria-label={currentPhrase}>
			<AnimatePresence mode="wait">
				<motion.span
					key={phraseIndex}
					initial={{ opacity: 0.3 }}
					animate={{ opacity: 1 }}
					transition={{ duration: 0.05 }}
				>
					{displayedText}
				</motion.span>
			</AnimatePresence>
			<motion.span
				className="text-accent ml-0.5 inline-block"
				animate={{ opacity: [1, 0] }}
				transition={{
					duration: 0.6,
					repeat: Infinity,
					repeatType: "reverse",
					ease: "easeInOut",
				}}
				aria-hidden
			>
				|
			</motion.span>
		</span>
	)
}
