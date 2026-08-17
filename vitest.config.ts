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
					include: ["src/**/*.test.tsx"],
					environment: "happy-dom",
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
			// `src/components/**/*.tsx` rather than `src/**/*.tsx`. The broad glob
			// hid logic, not just markup: any `.tsx` under `src/app` — a page's
			// `generateMetadata`, a layout's auth guard — was invisible to the
			// report no matter how much of it went untested, so a gap there could
			// never be noticed by looking.
			//
			// The trade is a set of rows that sit at 0% on purpose: the static page
			// bodies (`/about`, `/privacy/*`, the section indexes) are markup with
			// no branches, and nobody intends to render-test them. They drag the
			// headline number down about five points. That's tolerable because
			// nothing gates on it — `reporter: ["text"]` is informational, there is
			// no threshold — and a noisy report that shows real gaps beats a tidy
			// one that can't.
			// `src/app/api/**` is deliberately NOT excluded. It was, for the same
			// reason the broad `.tsx` glob was: it looked like plumbing. It is not —
			// the cron routes, the feed, and the `.md` route are among the densest
			// logic in the tree, and hiding them meant the commit whose stated
			// purpose was to stop hiding logic from this report left the largest new
			// logic in the range outside it.
			exclude: [
				"src/**/*.test.*",
				"src/generated/**",
				"src/components/**/*.tsx",
				"src/**/*.css",
				"src/**/*.d.ts",
			],
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
})
