"use client"

import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import Image from "next/image"
import { useEffect, useRef } from "react"
import { createPortal } from "react-dom"

interface LightboxImage {
	id: number
	url: string
	caption: string | null
}

interface Props {
	isOpen: boolean
	images: LightboxImage[]
	/** Index of the image to display; the parent owns this state. */
	index: number
	altPrefix: string
	/**
	 * Whether the gallery has anywhere to navigate. The parent's prev/next
	 * handlers cross section boundaries, so this is `true` even for a
	 * single-image section when other sections hold images.
	 */
	canNavigate: boolean
	onClose: () => void
	onPrev: () => void
	onNext: () => void
}

/**
 * Full-screen overlay that shows a project screenshot at (near) full
 * resolution. Rendered into a portal on `document.body` so it escapes the
 * page's `max-w-3xl` container and any stacking context, and so the backdrop
 * truly covers the viewport.
 *
 * Stays mounted while `isOpen` toggles so `AnimatePresence` can run the exit
 * animation. Controlled by the parent: `index`/`onPrev`/`onNext` walk the whole
 * gallery (across sections), and closing leaves the page on the last-viewed
 * image.
 */
export default function ProjectImageLightbox({
	isOpen,
	images,
	index,
	altPrefix,
	canNavigate,
	onClose,
	onPrev,
	onNext,
}: Props) {
	const prefersReducedMotion = useReducedMotion()
	const dialogRef = useRef<HTMLDivElement | null>(null)
	const closeButtonRef = useRef<HTMLButtonElement | null>(null)
	const current = images[index]

	// Lock body scroll while open so the page behind doesn't move, restoring
	// the original value on close (rather than assuming it was `""`).
	useEffect(() => {
		if (!isOpen) {
			return
		}

		const previousOverflow = document.body.style.overflow
		document.body.style.overflow = "hidden"

		return () => {
			document.body.style.overflow = previousOverflow
		}
	}, [isOpen])

	// Move focus into the dialog on open and restore it to the trigger on close,
	// so keyboard users aren't dropped back at the top of the document.
	useEffect(() => {
		if (!isOpen) {
			return
		}

		const previouslyFocused = document.activeElement as HTMLElement | null
		closeButtonRef.current?.focus()

		return () => previouslyFocused?.focus()
	}, [isOpen])

	// Keyboard: Escape closes, arrows paginate, Tab is trapped within the dialog.
	useEffect(() => {
		if (!isOpen) {
			return
		}

		function handleKeyDown(event: KeyboardEvent) {
			switch (event.key) {
				case "Escape":
					event.preventDefault()
					onClose()
					return
				case "ArrowLeft":
					if (canNavigate) {
						event.preventDefault()
						onPrev()
					}
					return
				case "ArrowRight":
					if (canNavigate) {
						event.preventDefault()
						onNext()
					}
					return
				case "Tab":
					trapTabFocus(event)
					return
			}
		}

		function trapTabFocus(event: KeyboardEvent) {
			const dialog = dialogRef.current

			if (dialog === null) {
				return
			}

			const focusable = dialog.querySelectorAll<HTMLElement>(
				'button, [href], [tabindex]:not([tabindex="-1"])'
			)

			if (focusable.length === 0) {
				return
			}

			const first = focusable[0]
			const last = focusable[focusable.length - 1]
			const active = document.activeElement

			if (event.shiftKey && active === first) {
				event.preventDefault()
				last.focus()
			} else if (!event.shiftKey && active === last) {
				event.preventDefault()
				first.focus()
			}
		}

		window.addEventListener("keydown", handleKeyDown)

		return () => window.removeEventListener("keydown", handleKeyDown)
	}, [isOpen, canNavigate, onClose, onPrev, onNext])

	// `createPortal` reads `document.body`, undefined during SSR; render nothing
	// on the server and let the client mount the portal.
	if (typeof document === "undefined") {
		return null
	}

	return createPortal(
		<AnimatePresence>
			{isOpen && (
				<motion.div
					ref={dialogRef}
					role="dialog"
					aria-modal="true"
					aria-label={`${altPrefix} screenshot, enlarged`}
					// Opaque, no `backdrop-filter`: the screenshots are transparent PNGs
					// with rounded corners, and a backdrop-blurred surface composites a
					// faint fringe at a transparent child's alpha edges — the corner halo.
					// The on-page gallery avoids it by sitting on the plain opaque page;
					// matching that here (solid surface, no blur) clears the artifact.
					className="fixed inset-0 z-[100] flex items-center justify-center bg-neutral-950 p-4 sm:p-8"
					onClick={onClose}
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					{/* Close button — always visible, top-right of the viewport. */}
					<button
						ref={closeButtonRef}
						type="button"
						onClick={(event) => {
							// Without this the click also bubbles to the backdrop's
							// close handler, firing `onClose` twice.
							event.stopPropagation()
							onClose()
						}}
						aria-label="Close enlarged image"
						className="absolute top-3 right-3 cursor-pointer rounded-full bg-white/10 p-2 text-white transition-colors duration-200 hover:bg-white/20 sm:top-5 sm:right-5"
					>
						<X size={22} />
					</button>

					{/* Image stage. `stopPropagation` keeps clicks on the image from
					    bubbling to the backdrop's close handler. */}
					<motion.div
						key={current.id}
						className="relative flex max-h-full w-full max-w-5xl flex-col items-center"
						onClick={(event) => event.stopPropagation()}
						initial={prefersReducedMotion ? false : { scale: 0.96 }}
						animate={{ scale: 1 }}
						transition={{ duration: 0.2 }}
					>
						{/* Sized to the image's own aspect (capped by the viewport) so
						    `rounded-xl` rounds the visible image, matching the on-page
						    gallery. */}
						<Image
							src={current.url}
							alt={current.caption ?? `${altPrefix} screenshot`}
							width={0}
							height={0}
							sizes="100vw"
							className="h-auto max-h-[80vh] w-auto max-w-full rounded-xl"
							priority
						/>

						{current.caption && (
							<p className="mt-3 text-center text-sm text-white/80">
								{current.caption}
							</p>
						)}
					</motion.div>

					{/* Prev / Next — siblings of the stage so clicks don't hit the
					    backdrop, sitting against the viewport edges. */}
					{canNavigate && (
						<>
							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation()
									onPrev()
								}}
								aria-label="Previous image"
								className="absolute top-1/2 left-2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2 text-white transition-colors duration-200 hover:bg-white/20 sm:left-4"
							>
								<ChevronLeft size={24} />
							</button>

							<button
								type="button"
								onClick={(event) => {
									event.stopPropagation()
									onNext()
								}}
								aria-label="Next image"
								className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer rounded-full bg-white/10 p-2 text-white transition-colors duration-200 hover:bg-white/20 sm:right-4"
							>
								<ChevronRight size={24} />
							</button>
						</>
					)}
				</motion.div>
			)}
		</AnimatePresence>,
		document.body
	)
}
