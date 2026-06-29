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
			"no-console": "warn",
			// `dangerouslySetInnerHTML` is the only HTML-injection surface in the
			// app, and the site's sole legitimate use is embedding JSON-LD. Ban the
			// attribute everywhere so the chokepoint can't be bypassed; the lone
			// exception is `JsonLdScript` (overridden below), which routes its value
			// through `safeJsonLdString` so it can't close the `<script>` tag. A
			// narrower "no raw JSON.stringify" rule wouldn't catch a hoisted variable
			// or a different serializer, so this guards the attribute itself.
			"no-restricted-syntax": [
				"error",
				{
					selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
					message:
						"Don't use dangerouslySetInnerHTML directly — render structured data through <JsonLdScript> (src/components/JsonLdScript.tsx), the single sanctioned chokepoint.",
				},
			],
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
		// The single sanctioned home for `dangerouslySetInnerHTML`. Everywhere
		// else the attribute is banned (see `no-restricted-syntax` above); here it
		// is the whole point of the component, gated by `safeJsonLdString`.
		files: ["src/components/JsonLdScript.tsx"],
		rules: {
			"no-restricted-syntax": "off",
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
