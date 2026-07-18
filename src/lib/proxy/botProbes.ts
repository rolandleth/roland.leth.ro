// Scanner/bot probe detection for the middleware. Kept in its own Next-free
// module so the (log-driven, ever-growing) lists and the matching logic can be
// reviewed and unit-tested in isolation, rather than buried in `proxy.ts`.
//
// The patterns are kept SPECIFIC on purpose: a blanket "has a dot" / "starts
// with a dot" rule would eat legitimate dotted legacy slugs (`/v1.2.3`,
// `/node.js`) and `/.well-known/*` (ACME, security.txt, apple-app-site-
// association). That's the same trap the `/_next/` short-circuit in `proxy.ts`
// documents having already fallen into once.

// Server-script, config, secret, dump, and archive extensions. Deliberately NOT
// `md` (blog markdown export), `txt`/`xml` (llms.txt, sitemap, robots), or the
// image/css/js the `config.matcher` already excludes. This site was never PHP/
// ASP/Java, so none of these can collide with a real legacy slug. A Set (vs. one
// big alternation regex) keeps the check O(1) and trivially extendable from logs.
export const BOT_PROBE_EXTENSIONS = new Set([
	"php",
	"php5",
	"php7",
	"phtml",
	"phar",
	"asp",
	"aspx",
	"jsp",
	"jspx",
	"cgi",
	"cfm",
	"do",
	"action",
	"env",
	"ini",
	"conf",
	"cfg",
	"toml",
	"yml",
	"yaml",
	"sql",
	"bak",
	"old",
	"swp",
	"sh",
	"pl",
	"py",
	"rb",
	"war",
	"jar",
	"dll",
	"tar",
	"gz",
	"tgz",
	"rar",
	"7z",
	"zip",
])

// Known scanner path segments (WordPress, PHP admin panels, VCS/secret dirs, Java
// actuators). `/.well-known` is deliberately absent — it's a real, load-bearing
// path. Matched with segment boundaries (see `isBotProbe`) so `/administrator`
// 404s but a hypothetical `/administrator-guide` post slug still passes through.
export const BOT_PROBE_PATH_PREFIXES = [
	"/wp-admin",
	"/wp-login",
	"/wp-content",
	"/wp-includes",
	"/wp-json",
	"/wordpress",
	"/xmlrpc",
	"/phpmyadmin",
	"/phpinfo",
	"/administrator",
	"/vendor",
	"/cgi-bin",
	"/actuator",
	"/.git",
	"/.env",
	"/.aws",
	"/.ssh",
	"/.svn",
	"/.hg",
	"/.vscode",
	"/.idea",
	"/.ds_store",
]

/**
 * True when `pathname` is an obvious scanner/bot probe — a script/config/archive
 * extension on ANY path segment or a known-bad path segment (WordPress, PHP admin
 * panels, exposed VCS/secret dirs).
 *
 * Every segment's extension is checked, not just the last: a probe like
 * `/shell.php/anything` puts the script extension on an inner segment to slip past
 * a last-segment-only check while still resolving to the same handler downstream.
 *
 * Path prefixes match only at a segment boundary (`===`, `/`, or `.`) so
 * `/administrator` and `/.env.local` match while `/administrator-guide` does not.
 * See `BOT_PROBE_EXTENSIONS` / `BOT_PROBE_PATH_PREFIXES` for why the match is kept
 * narrow rather than a blanket dotfile/extension rule.
 */
export function isBotProbe(pathname: string): boolean {
	const lowerPath = pathname.toLowerCase()

	for (const segment of lowerPath.split("/")) {
		const dotIndex = segment.lastIndexOf(".")

		// `dotIndex > 0` skips leading-dot dotfiles (`.env`): those resolve via the
		// path-prefix list, not by extension.
		if (dotIndex > 0 && BOT_PROBE_EXTENSIONS.has(segment.slice(dotIndex + 1))) {
			return true
		}
	}

	return BOT_PROBE_PATH_PREFIXES.some(
		(prefix) =>
			lowerPath === prefix ||
			lowerPath.startsWith(`${prefix}/`) ||
			lowerPath.startsWith(`${prefix}.`)
	)
}
