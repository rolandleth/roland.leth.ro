# Rolling History — last 90 days (through 2026-06-08)

## Themes

- **Broad DRY sweep (April)** — systematic deduplication across `lib/`, components, and API routes. Map-memoized wrappers extracted; `unstable_cache` normalize moved inside the cached function so call sites can't diverge on key shape; repeated query patterns unified. [source](dev-journal/2026-04.md)

- **Legacy redirect rethink (April)** — legacy redirect structure audited; paths either promoted to permanent redirects or removed. Atom feed redirect behaviour formalized alongside feed quality improvements. [source](dev-journal/2026-04.md)

- **Atom feed quality and markdown/AST infrastructure (April)** — `escapeCdata` helper added; typed `mdast` walk; `markdownToHtml` drops raw HTML (2026-04-21); `stripMarkdown` via AST walk (2026-04-20). This infrastructure later underpins `deriveSummary` (2026-05-18). [source](dev-journal/2026-04-21.md)

- **Security hardening (April–May)** — `EnvConfigError` type replaces generic throws at env-load; `bcrypt` module-load pattern; Redis constructor mock fixed; `timingSafeEqual` for auth comparisons (2026-04-26). Continued through May code reviews: endpoint input validation, auth boundary audit. [source](dev-journal/2026-04-26.md)

- **`unstable_cache` discipline** — normalize inside function established as invariant (April); code-review series reinforced the pattern across May. Prevents cache-key collisions from inconsistent normalization paths. [source](dev-journal/2026-04.md)

- **Code-review cadence and structural improvements (May)** — 13 reviews across May (2026-05-07 to 2026-05-22). Standing flags: `PostForm` shared mutation state, optimistic mutation rollback gaps, A11y. Cadence tightened: by 2026-05-22 each day's delta reviews-and-closes in one follow-up; recurring lesson — always read the cited file before treating an analyzer finding as actionable. [source](dev-journal/2026-05-18.md), [source](dev-journal/2026-05-22.md)

- **`src/lib/` 6-bucket reorganization (May)** — `db/`, `auth/`, `api/`, `content/`, `client/`, `utils/`; 140 files, 220 imports, committed `8d8fa8b`. Residual boundary misassignments flagged: `keepalive` in `api/`, `boundedCache` in `db/`, `theme.ts` in `client/` (server surface), `auth/env.ts` creates `db→auth` dependency. [source](dev-journal/2026-05-18.md)

- **Post.summary derivation (May)** — `Post.summary` `String?` → `NOT NULL`; `deriveSummary(body)` strips markdown, 160-char word-boundary truncation (`SUMMARY_MAX_CHARS = 160`), hard-slice fallback; edit-route resolution logic. Deploy requires `db:push` + backfill. [source](dev-journal/2026-05-18.md)

- **Test infrastructure speedup (May)** — `setupUser({ delay: null })` project-wide; `AnimatePresence mode="sync"` global mock in `setup.dom.ts`; 21 test files migrated; ~47% speedup (8.91s → 4.69s). Happy-dom Proxy identity bug diagnosed but not fixed. [source](dev-journal/2026-05-18.md)

- **`Project.platform` structural rewrite (May)** — 2026-05-20: free-text `Project.platform` → `bucket: PlatformBucket` (4 values) + `platformTags: PlatformTag[]` (19 values), eliminating three prose-derivation algorithms in `src/lib/utils/platforms.ts`. `PlatformPicker` → bucket radio + tag chips scoped to `BUCKET_SUGGESTED_TAGS[bucket]`; `compactLabel`/`detailLabel` for list vs detail. 2026-05-21 hardened it: schema-side `refineBucketTagCoherence` (`superRefine`) + duplicate-tag refine on create + update; explicit `<ErrorMessage>` submit gate replacing the hidden `required readOnly` input. Phase 2 (NOT NULL `bucket`, drop `platform`) = `ecc86d1`. The coherence rule later constrains the 2026-06-08 Reckon import (can't tag `macOS` under the iOS bucket). [source](dev-journal/2026-05-20.md), [source](dev-journal/2026-05-21.md)

- **Project-import tooling (June)** — 2026-06-08: a project-agnostic importer turning an app's marketing copy + screenshots into a portfolio project — `scripts/import-projects.ts` (runner), per-project `project.json` manifest, and the project-level `app-copy-to-project` skill that authors the manifest + stages images. Direct Prisma + direct Blob (the `seed-projects.ts` pattern), idempotent via deterministic keys `projects/<slug>/<path>` + delete-by-slug; reuses `projectCreateSchema` (data-integrity, powers `--dry-run`) and `toSectionCreate`/`toLinkCreate` (extracted to Next-free `projectMappers.ts`, shared with the admin routes). Deliberately omits the upload route's MIME/size checks — those guard untrusted network uploads, the importer handles trusted first-party files. [source](dev-journal/2026-06-08.md)

## Decisions of note

- **2026-04-XX — unstable_cache normalize inside fn** — normalization moved inside the cached function; call sites can't diverge on key shape silently. Alternative (normalize at call site) rejected as too easy to get wrong. [source](dev-journal/2026-04.md)
- **2026-04-26 — bcrypt module-load** — `bcrypt` loaded at module initialization rather than per-call; removes repeated require overhead on auth-heavy paths. [source](dev-journal/2026-04-26.md)
- **2026-05-18 — Post.summary NOT NULL** — `String?` removed; every post has a summary (derived if not authored). Deploy order: `db:push` → backfill → API surfaces expecting non-null. [source](dev-journal/2026-05-18.md)
- **2026-05-18 — deriveSummary word-boundary truncation** — `SUMMARY_MAX_CHARS = 160`; truncate at last word boundary before limit, hard-slice fallback. Watch-out: `lastSpace > 0` guard may return empty on edge inputs. [source](dev-journal/2026-05-18.md)
- **2026-05-18 — src/lib/ 6-bucket split** — feature-group over flat `lib/`; four residual misassignments flagged for follow-up. [source](dev-journal/2026-05-18.md)
- **2026-05-20 — `Project.platform` → `bucket` + `platformTags`** — structural enum replacement of free-text platform; stores structure instead of re-deriving it from prose (three algorithms deleted). [source](dev-journal/2026-05-20.md)
- **2026-05-21 — schema-side bucket/tag coherence** — `refineBucketTagCoherence` + duplicate-tag refine on create + update; explicit `ProjectForm` submit gate replaces the hidden `required readOnly` input (drops a `PlatformBucket` cast). [source](dev-journal/2026-05-21.md)
- **2026-06-08 — manifest-driven importer, direct Prisma + Blob** — chose `project.json` + script + skill over raw-markdown parsing (no stable schema) or the admin HTTP API (needs server/auth, random keys, auto-slug/sortOrder-shift); writes via direct Prisma + Blob (seed pattern), idempotent. Dropped the image MIME/size validation (trusted first-party files); kept `projectCreateSchema` as data-integrity. [source](dev-journal/2026-06-08.md)

## Incidents of note

- **2026-05-18 — Session lockout from `cd src/lib` + relative hook path** — `cd src/lib` mid-session made relative hook paths resolve incorrectly; Claude was locked out, user restarted. Avoid `cd` during active sessions when hooks use relative config paths. [source](dev-journal/2026-05-18.md)
- **2026-06-08 — `scripts/` wholly gitignored** — root `.gitignore` `scripts/` would have silently excluded the new importer (and the existing seeds); `db:import-projects` would break on a fresh clone. Narrowed to `scripts/imports/`; verified via `git check-ignore`. [source](dev-journal/2026-06-08.md)

## Timeline

- **2026-04-01–19** — DRY sweep; legacy redirects rethought; Atom feed quality; `unstable_cache` discipline; security hardening. [source](dev-journal/2026-04.md)
- **2026-04-20** — `unstable_cache` normalize inside fn; `stripMarkdown` via AST. [source](dev-journal/2026-04-20.md)
- **2026-04-21** — `escapeCdata`; typed `mdast` walk; `markdownToHtml` drops raw HTML. [source](dev-journal/2026-04-21.md)
- **2026-04-26** — Security hardening: `EnvConfigError`, module-load `bcrypt`, `timingSafeEqual`; Redis mock fix. [source](dev-journal/2026-04-26.md)
- **2026-05-07** — Code-review series started (Review 1). [source](dev-journal/2026-05-07.md)
- **2026-05-07–17** — Reviews 2–10: scheduled publishing, audit log, optimistic mutations, keepalive, bulk import, A11y. [source](dev-journal/2026-05-17.md)
- **2026-05-18** — `Post.summary` NOT NULL + `deriveSummary` (S1); ~47% test speedup (S2); `src/lib/` 6-bucket reorg `8d8fa8b`, session lockout incident (S3). [source](dev-journal/2026-05-18.md)
- **2026-05-20** — `Project.platform` → `bucket` + `platformTags`; `PlatformPicker` rewrite; `compactLabel`/`detailLabel`; phases 1 + 2 deployed. [source](dev-journal/2026-05-20.md)
- **2026-05-21** — bucket/tag coherence + duplicate-tag refine; `ProjectForm` submit gate; split `getProjectsGalleryCached()` + `getProjectsForAdmin()`. [source](dev-journal/2026-05-21.md)
- **2026-05-22** — closed review findings; `getProjectsForAdmin` cache-bypass pinned via `nextCacheSpyFactory` + module-load snapshot. [source](dev-journal/2026-05-22.md)
- **2026-06-08** — project-import tooling (importer + `project.json` manifest + `app-copy-to-project` skill); direct Prisma + Blob, idempotent; `tsx` + `db:import-projects`; root `.gitignore` narrowed to `scripts/imports/`. [source](dev-journal/2026-06-08.md)
