# Rolling History — last 90 days (through 2026-10-26)

## Themes

- **Admin-auth hardening, narrowed in August, swept comprehensively in September.** August's defense-in-depth layering (`adminEditMetadata`, `requireAdminPageSession` extended to all seven admin pages, source-text-regex guards rewritten to dynamic-import checks) kept missing a sibling instance each pass. September's 09-26 six-partition full-codebase review (121 issues) and 09-27 fixes closed the remaining class at once: a CSRF `Origin` check inside `requireAdmin` covering all 21 write handlers, plus `useUnsavedChangesGuard`. The one miss that review found — `/api/auth/login` skipping both the CSRF and content-type checks — was fixed within two days. [source](dev-journal/2026-08.md), [source](dev-journal/2026-09.md)
- **Scheduled-content revalidation: redesigned, broke production, then hardened.** August replaced hourly `revalidate=3600` with a due-check cron and static blog pagination, which caused a soft-404 incident (`loading.tsx` Suspense committing 200s before `notFound()` could set the status) fixed by route groups and per-item tag busts; the cron then gained `Promise.allSettled`, a wider lookback window and higher page caps. September found and fixed a guide-topic-hub cache-bust gap the cron's own comment had called "latent" when it wasn't. No related incidents recur in October. [source](dev-journal/2026-08.md), [source](dev-journal/2026-09.md)
- **Post.description/slug/media: a lineage of resolver bugs, each closed by consolidating write paths into one function.** September's six-day description-resolver chain (five disagreeing write paths, a 400 reintroduced by its own fix) closed by routing every writer through `postDescription.ts`. The same pattern repeated for slugs (09-26: frozen, authored, required in files) and for media (10-03: two-pass import planning so only written posts upload; 10-19: post-media deletes check other posts' bodies first, fail closed). [source](dev-journal/2026-09.md), [source](dev-journal/2026-10-03.md), [source](dev-journal/2026-10-19.md)
- **Project placement and page model rebuilt twice in six weeks.** September added `isOwnApp` and badge/pill CTA logic, found broken on re-import and on multi-store apps within a day. 10-03 replaced `isFeatured` with independent `prominence`/`pageLayout`/`isDiscontinued`/`isOwnApp` fields, released in one step against production. 10-11 added a `ProjectStatus` enum (`comingSoon`/`live`/`discontinued`), driven by Digest's pivot. 10-19's session 2 consolidated every store-button surface into one `StoreLinks` component. [source](dev-journal/2026-09.md), [source](dev-journal/2026-10-03.md), [source](dev-journal/2026-10-11.md)
- **Digest's medical-claims pivot reshaped legal pages sitewide.** 10-11: after a liability review, Digest dropped guided tests/labels from the shipped app and became `comingSoon`, with a disclaimer; Continuum's terms were reworded off "as is" for EU/UK consumers. 10-15 built `/privacy/digest`; 10-17 moved the disclaimer into an FAQ answer; 10-19/10-20 gave Digest and Weekly Gym their own terms pages, typed every legal-page date (`IsoDay`), and listed all 11 legal pages with `lastModified` in the sitemap — closing a drift that had left most legal pages out since May. [source](dev-journal/2026-10-11.md), [source](dev-journal/2026-10-19.md), [source](dev-journal/2026-10-20.md)
- **Import-script CLI parsing unified across September.** A single-dash typo (`-dry-run`) silently became a folder filter, prompting `parseCliArgs`, then a `CliSpec`/`parseScriptArgs` contract adopted by every import script by month-end — closing a fragmentation the month's own rollup had flagged as still open mid-month. [source](dev-journal/2026-09.md)
- **Review-process discipline and sandbox constraints, learned repeatedly.** "A guard that has never been seen to fail is a guard nobody has tested" recurs August through October; split-mode reviews that skip paired analyzer agents (09-27, 10-20) are flagged as a gap each time. Sandbox constraints are constant: no dev server or `.env`-reading scripts in unattended sessions, hook-blocked Bash shapes, worktrees with no `node_modules`. [source](dev-journal/2026-08.md), [source](dev-journal/2026-09.md), [source](dev-journal/2026-10-20.md)

## Decisions of note

- **2026-08-15 — OG card generation** — a dev-only route generating a committed PNG, chosen by the owner over a live Satori route and a hybrid; zero render cost in production. [source](dev-journal/2026-08.md)
- **2026-09-16 — Orphaned-upload cleanup** — a manual, dry-run-by-default sweep matching by UUID; rejected a per-write delete and a daily cron. [source](dev-journal/2026-09.md)
- **2026-10-02 — Product page section structure** — required `kind` with per-step galleries; rejected markdown-parsed steps with one shared gallery. [source](dev-journal/2026-10-02.md)
- **2026-10-03 — Video syntax** — reuses image markdown syntax, rewritten to `<video>`; rejected raw HTML (would reverse the site's no-raw-HTML stance). [source](dev-journal/2026-10-03.md)
- **2026-10-09 — More-projects preview animation** — a shared-element slide with two always-rendered overlaid layers; rejected Framer `layout`/`layoutId`, which couldn't keep both SSR and symmetric motion. [source](dev-journal/2026-10-09.md)
- **2026-10-19 — Hero rises without fading** — owner's pick for LCP; an opacity-0 element doesn't count toward it, at the cost of a less polished entrance. [source](dev-journal/2026-10-19.md)
- **2026-10-20 — Legal dates typed as `IsoDay`** — one list, formatted by the layout; a bad date now fails the build instead of silently shipping. [source](dev-journal/2026-10-20.md)

## Incidents of note

- **2026-08-17 — Soft 404 across three production routes** — `loading.tsx` Suspense boundaries let React commit a 200 and stream the shell before `notFound()` could set the status. Fixed with route groups and per-item tag busts; regression risk flagged as high and invisible, hence a filesystem guard. [source](dev-journal/2026-08.md)
- **2026-09-01 — `max-w-m` Tailwind typo** — Tailwind v4 silently dropped the unknown class, so the element fell back to the parent's `max-w-4xl`; no lint or `tsc` signal. [source](dev-journal/2026-09.md)
- **2026-09-26 — Loan calculator froze the tab** — `computeLoan` threw on sub-1 inputs inside a render-time `useMemo`; fixed with field validation and a max-period guard. [source](dev-journal/2026-09-26.md)
- **2026-10-09 — More-projects preview favored discontinued projects** — the preview took the first 10 after regrouping by platform, putting discontinued iOS projects ahead of live web ones; fixed by picking before grouping. [source](dev-journal/2026-10-09.md)
- **2026-10-19 — Priceless pricing cards with a false "US prices" note** — `pricingFor` returned a plans-only pricing kind even with no offers, and `[].every(...)` made the note vacuously true; found while writing a test for the gap. [source](dev-journal/2026-10-19.md)

## Timeline

- **2026-08-12** — `adminEditMetadata` closes an unauthenticated DB read; discontinued projects stay reachable with a bare storefront label. [source](dev-journal/2026-08.md)
- **2026-08-24** — Excerpt truncation moved to node-offset slicing, fixing reference-link brackets leaking into blog list excerpts. [source](dev-journal/2026-08.md)
- **2026-09-08** — Legacy `/api/feed/undefined` 404 fixed with a 308 redirect; root cause was an unset `NEXTAUTH_URL` from five months earlier. [source](dev-journal/2026-09.md)
- **2026-09-14** — `Post.summary` renamed to `Post.description`; guide markdown twin and a `BreadcrumbList` JSON-LD block shipped. [source](dev-journal/2026-09.md)
- **2026-09-23** — Production-credentials check centralized in `scriptEnv.ts` across every import script. [source](dev-journal/2026-09.md)
- **2026-10-02** — Product-page hero, best-value pricing, and shared FAQ motion shipped; gallery sections driven by existing placement flags. [source](dev-journal/2026-10-02.md)
- **2026-10-05** — Post-media branch merged into `release` (`5ae5b6f`); Vitest blocked locally by a stale Node 18.12.0 on the session shell's path. [source](dev-journal/2026-10-05.md)
- **2026-10-15** — `/privacy/digest` built from Digest's journal-only copy, with three deliberate copy changes from the source file. [source](dev-journal/2026-10-15.md)
- **2026-10-17** — Non-live project status renders in the store-button slot in place of a disabled CTA. [source](dev-journal/2026-10-17.md)

<!-- end -->
