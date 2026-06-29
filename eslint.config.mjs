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
			// Raw `JSON.stringify` inside `dangerouslySetInnerHTML` doesn't escape
			// `<`, `>`, `&`, or U+2028/9, so a value containing `</script>` can break
			// out of a JSON-LD block and inject HTML. Route every such block through
			// `safeJsonLdString` (src/lib/content/jsonLd.ts) instead.
			"no-restricted-syntax": [
				"error",
				{
					selector:
						'JSXAttribute[name.name="dangerouslySetInnerHTML"] CallExpression[callee.object.name="JSON"][callee.property.name="stringify"]',
					message:
						"Don't embed raw JSON.stringify in dangerouslySetInnerHTML — use safeJsonLdString from @/lib/content/jsonLd so values can't close the script tag.",
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
