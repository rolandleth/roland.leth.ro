import { describe, expect, it } from "vitest"
import { isBotProbe } from "@/lib/proxy/botProbes"

describe("isBotProbe", () => {
	it.each([
		"/wp-login.php",
		"/xmlrpc.php",
		"/index.php",
		"/admin.aspx",
		"/shell.jsp",
		"/backup.sql",
		"/site.zip",
		"/db.tar.gz",
		"/config.yml",
	])("flags the script/archive extension %s", (path) => {
		expect(isBotProbe(path)).toBe(true)
	})

	it.each([
		"/wp-admin",
		"/wp-admin/setup-config.php",
		"/.env",
		"/.env.local",
		"/.git/config",
		"/.ssh/id_rsa",
		"/phpmyadmin",
		"/administrator",
		"/actuator/health",
	])("flags the known-bad path %s", (path) => {
		expect(isBotProbe(path)).toBe(true)
	})

	// The bypass this replaces a last-segment-only check to close: a script
	// extension on an INNER segment resolves to the same handler downstream, so it
	// must be caught too.
	it.each(["/shell.php/anything", "/wp.php/index", "/x.env/keys"])(
		"flags a script extension on an inner segment: %s",
		(path) => {
			expect(isBotProbe(path)).toBe(true)
		}
	)

	it("matches path prefixes case-insensitively", () => {
		expect(isBotProbe("/WP-Admin")).toBe(true)
		expect(isBotProbe("/Shell.PHP")).toBe(true)
	})

	it.each([
		// Dotted legacy slugs predate `createSlug`'s `[a-z0-9-]` whitelist.
		"/v1.2.3",
		// Segment-boundary matching: a real slug that merely starts with a bad
		// prefix must survive.
		"/vendored-thoughts",
		"/wp-my-thoughts",
		"/administrator-guide",
		// Real, load-bearing paths that superficially look probe-shaped.
		"/.well-known/security.txt",
		"/llms.txt",
		"/sitemap.xml",
		"/robots.txt",
		"/blog/tech/my-post.md",
	])("does not flag the legitimate path %s", (path) => {
		expect(isBotProbe(path)).toBe(false)
	})
})
