import { render, screen } from "@testing-library/react"
import { MotionConfigContext } from "framer-motion"
import { useContext } from "react"
import { describe, expect, it } from "vitest"
import MotionPreferences from "./MotionPreferences"

function ReducedMotionProbe() {
	const { reducedMotion } = useContext(MotionConfigContext)

	return <span data-testid="reduced-motion">{String(reducedMotion)}</span>
}

describe("MotionPreferences", () => {
	// The whole app's reduced-motion handling is this one context value. Nothing
	// else fails if it regresses to Framer's default — the animations simply keep
	// playing for visitors who asked them not to, which no other test can see.
	it("puts the tree under Framer's reduced-motion handling", () => {
		render(
			<MotionPreferences>
				<ReducedMotionProbe />
			</MotionPreferences>
		)

		expect(screen.getByTestId("reduced-motion")).toHaveTextContent("user")
	})

	// The premise the component exists on. Framer ships `reducedMotion: "never"`,
	// so motion components ignore the OS preference until something opts in. If a
	// future version flips that default, this fails and the wrapper becomes
	// removable rather than quietly redundant.
	it("is not redundant — Framer's default ignores the preference", () => {
		render(<ReducedMotionProbe />)

		expect(screen.getByTestId("reduced-motion")).toHaveTextContent("never")
	})
})
