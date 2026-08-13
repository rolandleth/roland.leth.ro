import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import importPlugin from "eslint-plugin-import"
import prettier from "eslint-plugin-prettier/recommended"
import sonarjs from "eslint-plugin-sonarjs"
import tseslint from "typescript-eslint"

const sonarRecommended = /** @type {import("eslint").Linter.Config} */ (
	// @ts-expect-error -- sonarjs.configs is typed as optional but always present in v4
	sonarjs.configs.recommended
)

// Shared `no-restricted-syntax` entries. Extracted because flat config *replaces*
// a rule's options rather than merging them: any later block that sets
// `no-restricted-syntax` for a narrower file set would silently drop these unless
// it spreads them back in. See the page-metadata block near the bottom.
const restrictedSyntax = [
	{
		selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
		message:
			"Don't use dangerouslySetInnerHTML directly — render structured data through <JsonLdScript> (src/components/JsonLdScript.tsx), the single sanctioned chokepoint.",
	},
	{
		selector: 'Property[key.name="dangerouslySetInnerHTML"]',
		message:
			"Don't build a dangerouslySetInnerHTML prop — render structured data through <JsonLdScript> (src/components/JsonLdScript.tsx), the single sanctioned chokepoint.",
	},
]

const eslintConfig = defineConfig([
	// Filter out next/typescript which registers @typescript-eslint plugin;
	// tseslint.configs.strict below owns that registration.
	...nextVitals.filter((c) => c.name !== "next/typescript"),
	...tseslint.configs.strict,
	sonarRecommended,
	{
		rules: {
			"sonarjs/no-nested-conditional": "off",
			// Redundant with @typescript-eslint/no-unused-vars which has _ prefix ignore configured.
			"sonarjs/no-unused-vars": "off",
		},
	},
	prettier,
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		".claude/**",
		".vscode",
		"out/**",
		"build/**",
		"next-env.d.ts",
		"./src/generated/prisma/**",
	]),
	{
		plugins: {
			import: importPlugin,
		},
		settings: {
			"import/resolver": {
				typescript: {
					alwaysTryTypes: true,
					project: "./tsconfig.json",
				},
			},
		},
		rules: {
			"react/jsx-key": [
				"error",
				{
					checkFragmentShorthand: true, // <>…</> used as an array item (can't take a key)
					checkKeyMustBeforeSpread: true, // key placed after {...spread}, which React drops
					warnOnDuplicates: true, // two siblings with the same key
				},
			],
			"no-console": "warn",
			// `dangerouslySetInnerHTML` is the only HTML-injection surface in the
			// app, and the site's sole legitimate use is embedding JSON-LD. Ban both
			// forms — the JSX attribute and the object-property key (which covers
			// `React.createElement("script", { dangerouslySetInnerHTML })` and an
			// inline spread object) — so the common paths route through
			// `JsonLdScript` (overridden below), which serializes via
			// `safeJsonLdString` so the value can't close the `<script>` tag. A
			// narrower "no raw JSON.stringify" rule wouldn't catch a hoisted variable
			// or a different serializer, so this guards the attribute itself.
			//
			// Residual gap (by design, not a hole a lint can close): a prop object
			// carrying `dangerouslySetInnerHTML` that's built in another module and
			// spread in (`<script {...props} />`) is invisible to a static selector.
			// That path is caught in review, not here.
			"no-restricted-syntax": ["error", ...restrictedSyntax],
			"no-unused-vars": "off",
			"no-empty": ["error", { allowEmptyCatch: true }],
			"@typescript-eslint/no-non-null-assertion": "error",
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{
					varsIgnorePattern: "^_",
					argsIgnorePattern: "^_",
				},
			],
			"import/order": [
				"warn",
				{
					groups: [
						"builtin",
						"external",
						"internal",
						"parent",
						"sibling",
						"index",
						"type",
					],
					"newlines-between": "never",
					alphabetize: { order: "asc", caseInsensitive: true },
				},
			],
			"import/first": "warn",
			"import/no-duplicates": "warn",
			"import/newline-after-import": "warn",
			"import/no-unassigned-import": "error",
		},
	},
	{
		// The sanctioned homes for `dangerouslySetInnerHTML`. Everywhere else the
		// attribute is banned (see `no-restricted-syntax` above); in these two it
		// is the whole point of the component:
		//   - JsonLdScript: structured data, gated by `safeJsonLdString`.
		//   - ThemeScript: a raw pre-paint inline script that sets the theme class
		//     before first paint (a static, self-authored string, no injected data).
		files: [
			"src/components/JsonLdScript.tsx",
			"src/components/ThemeScript.tsx",
		],
		rules: {
			"no-restricted-syntax": "off",
		},
	},
	{
		// Next resolves `openGraph`/`twitter` one top-level key at a time: a page
		// that defines either gets its own object resolved and assigned *over* the
		// root layout's, with the parent's never passed in. So a page writing a raw
		// `openGraph` silently drops `siteName`, `locale`, `card`, and `creator` —
		// invisible in review and in the rendered page, visible only in a share
		// debugger. Every content page did exactly this until 2026-08-12.
		//
		// `buildPageMetadata` (src/lib/content/metadata.ts) is the chokepoint that
		// restates the site-wide fields. This keeps it the only way in.
		//
		// Scoped to pages: `src/app/layout.tsx` legitimately owns the root object,
		// and `src/lib` is where the builder lives. A nested `layout.tsx` could
		// reintroduce the same bug and isn't covered — there are none today, and a
		// glob that excludes only the root layout costs more than it buys.
		files: ["src/app/**/page.tsx"],
		rules: {
			"no-restricted-syntax": [
				"error",
				...restrictedSyntax,
				{
					selector: 'Property[key.name="openGraph"]',
					message:
						"Don't define openGraph on a page — Next assigns it over the root layout's object instead of merging, so the site-wide fields vanish. Build metadata with buildPageMetadata (src/lib/content/metadata.ts).",
				},
				{
					selector: 'Property[key.name="twitter"]',
					message:
						"Don't define twitter on a page — Next assigns it over the root layout's object instead of merging, so the site-wide fields vanish. Build metadata with buildPageMetadata (src/lib/content/metadata.ts).",
				},
			],
		},
	},
	{
		files: [
			"**/*.test.ts",
			"**/*.test.tsx",
			"**/test/setup*.ts",
			"scripts/*.ts",
		],
		rules: {
			"sonarjs/prefer-specific-assertions": "off",
			"sonarjs/no-hardcoded-passwords": "off",
			"no-console": "off",
			"no-undef": "off",
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/ban-ts-comment": "off",
			"import/first": "off",
			"import/no-unassigned-import": "off",
		},
	},
])

export default eslintConfig
