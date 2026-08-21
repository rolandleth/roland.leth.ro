import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import importPlugin from "eslint-plugin-import"
import jsxA11y from "eslint-plugin-jsx-a11y"
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
// `exemptForInnerHtmlFiles` marks the entries that JsonLdScript and ThemeScript
// are allowed to break. Tagged explicitly rather than detected: the filter below
// used to test whether the SELECTOR STRING contained
// "dangerouslySetInnerHTML", which keys on spelling instead of intent. A future
// raw-HTML ban worded without that literal stayed enforced in the two files that
// need the exemption, and one that merely mentioned the string in its message
// was silently dropped there. Neither failure announces itself.
const restrictedSyntaxRules = [
	{
		selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
		message:
			"Don't use dangerouslySetInnerHTML directly — render structured data through <JsonLdScript> (src/components/JsonLdScript.tsx), the single sanctioned chokepoint.",
		exemptForInnerHtmlFiles: true,
	},
	{
		selector: 'Property[key.name="dangerouslySetInnerHTML"]',
		message:
			"Don't build a dangerouslySetInnerHTML prop — render structured data through <JsonLdScript> (src/components/JsonLdScript.tsx), the single sanctioned chokepoint.",
		exemptForInnerHtmlFiles: true,
	},
]

/** ESLint rejects unknown option keys, so the marker never reaches it. */
const asRule = ({ selector, message }) => ({ selector, message })

const restrictedSyntax = restrictedSyntaxRules.map(asRule)

// What `restrictedSyntax` still has to say to the two files that are allowed to
// use `dangerouslySetInnerHTML`. Empty today, because that is all the constant
// bans so far.
const restrictedSyntaxBeyondInnerHtml = restrictedSyntaxRules
	.filter((entry) => !entry.exemptForInnerHtmlFiles)
	.map(asRule)

// Where page metadata is actually declared. The keys below are banned only
// inside these, not anywhere a property happens to share the name: a plain
// `Property[key.name="twitter"]` also matched a social-links map, and the likely
// response to that false positive — a blanket `eslint-disable-next-line
// no-restricted-syntax` — would switch off the `dangerouslySetInnerHTML` bans on
// the same line. One rule id carries both a security guard and a style guard, so
// every escape hatch has to be narrow.
const metadataScopes = [
	'VariableDeclarator[id.name="metadata"]',
	'VariableDeclarator[id.name="generateMetadata"]',
	'FunctionDeclaration[id.name="generateMetadata"]',
]

const metadataKeys = ["openGraph", "twitter"]

const pageMetadataRestrictions = metadataScopes.flatMap((scope) =>
	metadataKeys.map((key) => ({
		selector: `${scope} Property[key.name="${key}"]`,
		message: `Don't define ${key} on a page or nested layout — Next assigns it over the root layout's object instead of merging, so the site-wide fields vanish. Build metadata with buildPageMetadata (src/lib/content/metadata.ts).`,
	}))
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
		// `eslint-config-next` enables six jsx-a11y rules (alt-text, aria-props,
		// aria-proptypes, aria-unsupported-elements, role-has-required-aria-props,
		// role-supports-aria-props). This turns on the rest of the recommended set:
		// the accessibility work here is hand-rolled — APG keyboard nav, a focus
		// trap with restore, `inert` + `aria-hidden` on collapsed panels — and
		// nothing in CI noticed when a change undid a piece of it.
		//
		// Rules only, no `plugins` key. `next` already registers `jsx-a11y` (as a
		// module namespace object), and flat config rejects a second registration
		// under the same name with `Cannot redefine plugin` — spreading
		// `jsxA11y.flatConfigs.recommended` wholesale fails at startup. Scoped to
		// `.tsx` so the rule ids always resolve against that registration, which is
		// itself scoped to source files.
		files: ["**/*.tsx"],
		rules: {
			...jsxA11y.flatConfigs.recommended.rules,
			// `<ol role="list">` is redundant per the HTML spec and load-bearing in
			// practice: WebKit drops list semantics from a list styled
			// `list-style: none`, so VoiceOver stops announcing "list, 1 of 6". The
			// role restores it. Allowed on both list elements, since the same
			// `list-none` styling is what triggers the bug in either.
			"jsx-a11y/no-redundant-roles": ["error", { ol: ["list"], ul: ["list"] }],
			// The rule's premise — `tabIndex` belongs on interactive elements — has
			// one standing exception: a scrollable container has to be focusable or
			// keyboard-only users can't scroll it (WCAG 2.1.1). Its default
			// allowlist covers `tabpanel` alone; `group` is the role this codebase
			// labels those containers with.
			"jsx-a11y/no-noninteractive-tabindex": [
				"error",
				{ tags: [], roles: ["tabpanel", "group"], allowExpressionValues: true },
			],
			// Watch the DOM attribute, not every prop that shares its name.
			// `SearchForm` takes an `autoFocus` prop and deliberately does *not*
			// forward it to the input — it focuses through a ref in an effect, to
			// keep the focus off React's render pass. Left at the default, the rule
			// reports that component and its four tests, which is precisely
			// backwards.
			"jsx-a11y/no-autofocus": ["error", { ignoreNonDOM: true }],
		},
	},
	{
		// The sanctioned homes for `dangerouslySetInnerHTML`. Everywhere else the
		// attribute is banned (see `no-restricted-syntax` above); in these two it
		// is the whole point of the component:
		//   - JsonLdScript: structured data, gated by `safeJsonLdString`.
		//   - ThemeScript: a raw pre-paint inline script that sets the theme class
		//     before first paint (a static, self-authored string, no injected data).
		//
		// Only the `dangerouslySetInnerHTML` entries are dropped; anything else
		// `restrictedSyntax` grows is respread and still applies here. A flat
		// `"no-restricted-syntax": "off"` would exempt these two files from every
		// future entry — the same silent-drop hazard the comment on that constant
		// describes, mirrored.
		//
		// The ternary is load-bearing, not defensive: ESLint retains a rule's
		// previous options when a later config gives severity only, so `["error"]`
		// with an empty spread keeps both bans rather than clearing them. `off` is
		// the only way to say "nothing" — and the moment a non-innerHTML entry is
		// added, this switches itself back on for these files.
		//
		// An inline `eslint-disable-next-line` would be narrower still, but
		// Prettier strips `//` comments from JSX attribute position, so the
		// directive doesn't survive a format.
		files: [
			"src/components/JsonLdScript.tsx",
			"src/components/ThemeScript.tsx",
		],
		rules: {
			"no-restricted-syntax":
				restrictedSyntaxBeyondInnerHtml.length > 0
					? ["error", ...restrictedSyntaxBeyondInnerHtml]
					: "off",
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
		// Nested layouts are in scope too: a `layout.tsx` below the root has the
		// same relationship to the root object that a page does, so it can
		// reintroduce the identical bug. `src/app/layout.tsx` is the one file that
		// legitimately owns the root object, and flat config takes `ignores`
		// alongside `files`, so excluding exactly it is one line in this block.
		// (`src/lib` is where the builder lives, and is outside `files` already.)
		files: ["src/app/**/page.tsx", "src/app/**/layout.tsx"],
		ignores: ["src/app/layout.tsx"],
		rules: {
			"no-restricted-syntax": [
				"error",
				...restrictedSyntax,
				...pageMetadataRestrictions,
			],
		},
	},
	{
		files: [
			"**/*.test.ts",
			"**/*.test.tsx",
			"**/test/setup*.ts",
			// `.tsx` too: `generate-og-card.tsx` renders JSX through Satori, so a
			// build script can legitimately be a `.tsx` file.
			"scripts/*.{ts,tsx}",
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
