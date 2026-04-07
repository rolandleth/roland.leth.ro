"use client"

import { motion, AnimatePresence } from "framer-motion"
import { useState, useEffect, useCallback } from "react"

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

type Phase = "typing" | "paused" | "erasing" | "waiting"

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

	const advanceToNextPhrase = useCallback(() => {
		setPhraseIndex((prev) => (prev + 1) % phrases.length)
		setPhase("typing")
	}, [phrases.length])

	useEffect(() => {
		let timeout: ReturnType<typeof setTimeout>

		switch (phase) {
			case "typing": {
				if (displayedText.length < currentPhrase.length) {
					timeout = setTimeout(() => {
						setDisplayedText(currentPhrase.slice(0, displayedText.length + 1))
					}, typeSpeed)
				} else {
					timeout = setTimeout(() => setPhase("paused"), 0)
				}
				break
			}

			case "paused": {
				timeout = setTimeout(() => {
					setPhase("erasing")
				}, pauseAfterType)
				break
			}

			case "erasing": {
				if (displayedText.length > 0) {
					timeout = setTimeout(() => {
						setDisplayedText(displayedText.slice(0, displayedText.length - 1))
					}, eraseSpeed)
				} else {
					timeout = setTimeout(() => setPhase("waiting"), 0)
				}
				break
			}

			case "waiting": {
				timeout = setTimeout(advanceToNextPhrase, pauseAfterErase)
				break
			}
		}

		return () => clearTimeout(timeout)
	}, [
		phase,
		displayedText,
		currentPhrase,
		typeSpeed,
		eraseSpeed,
		pauseAfterType,
		pauseAfterErase,
		advanceToNextPhrase,
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
