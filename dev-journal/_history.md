# Rolling History — last 30 days (through 2026-10-26)

## Themes

- **Admin hardening sweep closed out across four sessions.** 09-26's six-partition full-codebase review (121 issues, 30 missing tests) shipped alongside frozen, authored slugs for posts/projects (no rename path, required `slug:` in files) and a fix for the `ImageUpload`/`useOrderedList` stale-closure upload race. 09-27 added a CSRF `Origin` check inside `requireAdmin` (all 21 write handlers) and `useUnsavedChangesGuard`. 09-28 fixed the guard misfiring after a successful save (`hasSucceeded`). 09-29 fixed HEIC-accepted-as-AVIF (`isAvifFtyp`/`hasCompatibleAvifBrand`) and unified every import script's argument parsing under one `CliSpec`. [source](dev-journal/2026-09-26.md), [source](dev-journal/2026-09-27.md), [source](dev-journal/2026-09-29.md)
- **Project page rebuilt around a placement model, then media, then store-link consolidation.** 10-02 shipped the new product-page section structure (`kind`/`layout`, steps, best-value pricing, shared FAQ motion). 10-03 replaced `isFeatured` with independent `prominence`/`pageLayout`/`isDiscontinued`/`isOwnApp` fields (one-step production release, no temporary schema) and added post video support (Blob signed browser upload, `rehypeVideo`, two-pass import planning). 10-11 added a `ProjectStatus` enum (`comingSoon`/`live`/`discontinued`) replacing `isDiscontinued`, driven by the Digest pivot. 10-19's session 2 consolidated hero/pricing/closing/`AppTile` store buttons into one `StoreLinks` component and fixed a `pricingFor` bug rendering priceless cards. [source](dev-journal/2026-10-03.md), [source](dev-journal/2026-10-11.md), [source](dev-journal/2026-10-19.md)
- **Digest's medical-claims pivot reshaped legal pages sitewide.** 10-11: after a liability review, Digest dropped guided tests/labels from the shipped app and became `comingSoon`, with a disclaimer; Continuum's terms were reworded off "as is" for EU/UK consumers. 10-15 built `/privacy/digest`; 10-17 moved the disclaimer into an FAQ answer. 10-19/10-20 gave Digest and Weekly Gym their own terms pages, typed every legal-page date (`IsoDay` in `legalPages.ts`), and listed all 11 legal pages with `lastModified` in the sitemap, closing a drift that had left most legal pages out since May. [source](dev-journal/2026-10-11.md), [source](dev-journal/2026-10-17.md), [source](dev-journal/2026-10-20.md)
- **Recurring sandbox and review-process lessons.** Unattended sessions can't start a dev server or run `.env`-reading scripts, so browser/database checks pile up as open threads nearly every session. Hook-blocked Bash shapes (`rg --glob`, `git -C`, piped `diff`) recur; `node --import tsx` sidesteps the blocked tsx CLI (10-15). Split-mode reviews that skip paired analyzer agents (09-27, 10-20) are flagged as a gap each time. [source](dev-journal/2026-09-29.md), [source](dev-journal/2026-10-15.md), [source](dev-journal/2026-10-20.md)

## Timeline

- **2026-09-26** — Full-codebase review (121 issues) run in six partitions; project/post slugs frozen and authored. [source](dev-journal/2026-09-26.md)
- **2026-09-27** — CSRF `Origin` check added inside `requireAdmin`; `useUnsavedChangesGuard` shipped. [source](dev-journal/2026-09-27.md)
- **2026-09-28** — Unsaved-changes guard fixed to disarm after a successful save (`hasSucceeded`). [source](dev-journal/2026-09-28.md)
- **2026-09-29** — HEIC-as-AVIF bug fixed; `CliSpec`/`parseScriptArgs` unify all import-script argument parsing. [source](dev-journal/2026-09-29.md)
- **2026-10-02** — Product page (sections, best-value pricing, FAQ motion) and gallery placement shipped; Continuum headline picked by Roland. [source](dev-journal/2026-10-02.md)
- **2026-10-03** — `isFeatured` replaced by `prominence`/`pageLayout`; post video upload and import support added. [source](dev-journal/2026-10-03.md)
- **2026-10-05** — Post-media branch merged into `release` (`5ae5b6f`); Vitest blocked by a stale Node 18.12.0 on the session shell's path, not a code fault. [source](dev-journal/2026-10-05.md)
- **2026-10-09** — More-projects preview animation fixed a bug that favored discontinued projects over live ones. [source](dev-journal/2026-10-09.md)
- **2026-10-11** — `ProjectStatus` enum added; Digest pivots away from guided tests/labels after a liability review. [source](dev-journal/2026-10-11.md)
- **2026-10-15** — `/privacy/digest` built from Digest's journal-only copy, with three deliberate copy changes. [source](dev-journal/2026-10-15.md)
- **2026-10-17** — Non-live project status fills the store-button slot; Digest's disclaimer moved into an FAQ answer. [source](dev-journal/2026-10-17.md)
- **2026-10-19** — CSP's Blob API `connect-src` scoped to `/admin/:path*` only; hero image now rises without a fade (LCP). [source](dev-journal/2026-10-19.md)
- **2026-10-20** — Legal-page dates typed as `IsoDay`; sitemap lists all 11 legal pages with `lastModified`. [source](dev-journal/2026-10-20.md)

<!-- end -->
