import path from "path"
import { config } from "dotenv"
import { defineConfig } from "vitest/config"

// Load .env.test before any test module is imported so that modules with
// module-level side effects (e.g. the Prisma client singleton in db.ts) can
// read environment variables during initialisation.
config({ path: ".env.test" })

export default defineConfig({
	test: {
		environment: "node",
		setupFiles: ["./src/test/setup.ts"],
		projects: [
			{
				extends: true,
				test: {
					include: ["src/components/**/*.test.tsx"],
					environment: "jsdom",
					setupFiles: ["./src/test/setup.dom.ts"],
				},
			},
			{
				extends: true,
				test: {
					include: ["src/**/*.test.ts"],
				},
			},
		],
		unstubEnvs: true,
		restoreMocks: true,
		coverage: {
			provider: "v8",
			reporter: ["text"],
			include: ["src/**"],
			exclude: [
				"src/**/*.test.*",
				"src/generated/**",
				"src/**/*.tsx",
				"src/**/*.css",
				"src/**/*.d.ts",
				"src/app/api/**",
			],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
})
