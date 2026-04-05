"use client"

import { motion } from "framer-motion"
import { Monitor, Moon, Sun } from "lucide-react"
import { useTheme, type Theme } from "./ThemeProvider"

const options: { value: Theme; icon: React.ReactNode; label: string }[] = [
	{ value: "system", icon: <Monitor size={15} />, label: "System theme" },
	{ value: "light", icon: <Sun size={15} />, label: "Light theme" },
	{ value: "dark", icon: <Moon size={15} />, label: "Dark theme" },
]

export default function ThemeToggle() {
	const { theme, setTheme } = useTheme()

	return (
		<div
			role="group"
			aria-label="Theme"
			className="border-border bg-background/40 flex items-center gap-0.5 rounded-full border p-1 backdrop-blur-sm"
		>
			{options.map(({ value, icon, label }) => (
				<button
					key={value}
					onClick={() => setTheme(value)}
					aria-label={label}
					aria-pressed={theme === value}
					className={`relative cursor-pointer rounded-full p-1.5 transition-colors ${
						theme === value
							? "text-primary"
							: "text-secondary hover:text-primary"
					}`}
				>
					{theme === value && (
						<motion.span
							layoutId="theme-selection"
							className="bg-border absolute inset-0 rounded-full"
							transition={{ type: "spring", duration: 0.3, bounce: 0.2 }}
						/>
					)}
					<span className="relative">{icon}</span>
				</button>
			))}
		</div>
	)
}
