# Rolling History — last 90 days (through 2026-06-15)

## Themes

- **Broad DRY sweep + structural simplification** (April) — 96 files, 10 commits: `projectInclude` extraction, `capitalizeSection`, `AnimatedCard` unification, `React.cache()` for per-request dedupe; legacy redirect collapsed into catch-all `src/app/[slug]/page.tsx` (`permanentRedirect(308)` on hit, `notFound()` on miss); `KNOWN_ROUTES` dissolved; `Section` closed union. `SiteChrome.tsx` deleted. [source](dev-journal/2026-04.md)

- **Security hardening (incremental arc)** (April–June) — April: hex Zod check on `ADMIN_HASH_PASSWORD`; `EnvConfigError` typed for missing env vars; module-load bcrypt dummy (~80ms prevents timing oracle); `getRedisConfig()` centralized; `crypto.timingSafeEqual`. May: `sanitizeLogString` for log injection; `/api/upload` → `/api/admin/upload`; magic-byte sniff. June: `IP_HASH_SECRET` HMAC for per-IP rate limiting (hash not log PII); keyspace partition `ip:<hash>` vs `"global"`; leftmost-XFF trust documented. [source](dev-journal/2026-04.md) [source](dev-journal/2026-05.md) [source](dev-journal/2026-06.md)

- **`unstable_cache` discipline** (April–May) — April: production 500 from `Date.getTime()` called on a cache-hit string (Next.js serializes return values; normalize inside the cached function). May: `isFutureDatetime(datetime, now)` introduced with required `now` param (vi.mock intra-module reference gotcha solved by required injection); padded cache TTL approach rejected in favor of read-time filter. Three reversals before landing the correct pattern. [source](dev-journal/2026-04.md) [source](dev-journal/2026-05.md) [source](dev-journal/2026-05-17.md)

- **Atom feed quality** (April) — `stripMarkdown` via AST (not regex); `escapeCdata`; CDATA terminator protection; consistent feed metadata; feed regression tests. [source](dev-journal/2026-04.md)

- **Admin tooling expansion** (May) — Bulk import: `bulkImportParser.ts`, `createManyAndReturn + skipDuplicates`, post-insert slug-set diff, `BULK_MAX_FILES`, `batchId` UUID per run; `AdminAuditTag` typed union + `ADMIN_AUDIT_TAGS as const`; `batchId: string | null` on `AdminAuditPayload`. `useOptimisticMutation` hook: unmount-after-resolve race fixed (null `abortRef.current` in cleanup); optimistic-toggle revert bug (capture `const prev` before optimistic set). Upstash keepalive: daily cron, `writeKeepalive` shared, `getKeepaliveRedis()` lazy memoized. [source](dev-journal/2026-05.md) [source](dev-journal/2026-05-17.md)

- **A11y + structural cleanup** (May) — Carousel APG pattern; `<main>` hoisted to root layout; `<time dateTime>` ISO 8601; `BooleanFlagToggle` collapse. [source](dev-journal/2026-05.md)

- **Test infrastructure** (May) — `setupUser({delay:null})` cuts bcrypt wait; `AnimatePresence mode="sync"` global mock; ~47% test time reduction; `nextCacheSpyFactory` + module-load snapshot pins cache-wrap set; `mockPickerConfig.autoFill` modes; `src/lib/` 6-bucket reorganization (140 files, 220 imports, commit `8d8fa8b`). [source](dev-journal/2026-05.md) [source](dev-journal/2026-05-18.md) [source](dev-journal/2026-05-22.md)

- **Project platform restructure** (May) — `PlatformBucket` enum + `PlatformTag[]` array; Postgres enums; `compactLabel` Fullstack family-set rule (`Next.js` cross-listed); schema coherence `superRefine`; `getProjectsGalleryCached`/`getProjectsForAdmin` split. [source](dev-journal/2026-05-20.md) [source](dev-journal/2026-05-21.md)

- **`Post.summary` required field** (May) — `Post.summary: String NOT NULL`; `deriveSummary` (AST markdown strip, 160-char word-boundary truncation); edit-route resolution logic (4-branch: authored/cleared/body-changed/unchanged). [source](dev-journal/2026-05-18.md)

- **Manifest-driven project importer** (June) — `scripts/import-projects.ts` + `project.json`; content-addressed `SHA256[:64-bit]` keys; `BlobStore` DI; orphan pruning; blob pagination; 4-parallel uploads. [source](dev-journal/2026-06.md)

- **Legal pages + rate limiting** (June) — `LegalPageLayout` generalized; `AppleLegalLink`; `continuumLegalLinks.ts` cross-link cluster; `IP_HASH_SECRET` HMAC; keyspace partition; 5 new rate-limit tests. [source](dev-journal/2026-06.md)

## Decisions of note

- **2026-04 — Legacy redirect → catch-all page** — `src/app/[slug]/page.tsx` with DB lookup replaces pattern-match middleware for root-level slugs; `permanentRedirect(308)` on hit; `notFound()` on miss; `KNOWN_ROUTES` dissolved (would drift). [source](dev-journal/2026-04.md)
- **2026-04 — React.cache() for per-request dedupe** — `unstable_cache` is segment-level (multi-request); `React.cache()` dedupes within a single RSC render tree; both needed for different scopes. [source](dev-journal/2026-04.md)
- **2026-04 — unstable_cache: normalize inside the cached function** — serialize/deserialize must be invisible to callers; `Date.getTime()` on a string (cache-hit path) threw; fix: normalize to `Date` object inside the cached fn. [source](dev-journal/2026-04.md)
- **2026-05-05 — Time-based publishing: filter at read-time with padded TTL** — initially filtered inside cached fn (wrong: cache epoch determines visibility); then read-time filter + padded cache; then `isFutureDatetime(datetime, now)` with required `now` param. Third attempt stable. [source](dev-journal/2026-05.md)
- **2026-05 — AdminAuditTag typed union** — `ADMIN_AUDIT_TAGS as const` array; `AdminAuditTag` inferred union type; `batchId: string | null` required (not optional) for traceability per batch run. [source](dev-journal/2026-05.md)
- **2026-05 — Upstash keepalive** — Upstash Redis free tier evicts inactive databases after ~30 days; daily `writeKeepalive` cron prevents eviction; `getKeepaliveRedis()` lazy memoized (not module-level) to avoid cold-start load. [source](dev-journal/2026-05.md)
- **2026-05-18 — src/lib/ 6-bucket reorganization** — db / auth / api / content / client / utils buckets; single commit `8d8fa8b`; 220 imports rewritten; hook relative-path failure from `cd src/lib` was an artifact of hook configuration (session lockout). [source](dev-journal/2026-05-18.md)
- **2026-05-20 — PlatformBucket + PlatformTag[] Postgres enums** — rejected string field (too loose for filtering); two-phase deployment (schema migration + code deploy brief broken window) accepted for correctness. [source](dev-journal/2026-05-20.md)
- **2026-06-08 — Manifest-driven import over programmatic** — `project.json` as source of truth decouples content from code; direct Prisma write (skips Next cache revalidation — accepted tradeoff). Import is replace-by-slug; admin edits since last import overwritten on re-run. [source](dev-journal/2026-06.md)
- **2026-06-10 — Content-addressed blob keys** — `SHA256[:N]` of file content; same content → same key → CDN cache hit; content changes → automatic cache-bust. Orphan pruning required because old keys linger. [source](dev-journal/2026-06.md)
- **2026-06-10 — HMAC per-IP rate limiting** — hash IP against `IP_HASH_SECRET` (no raw IP in logs = no PII); leftmost XFF trust correct for Vercel topology; global bucket fallback when secret absent (single-user site; accepted DoS risk). [source](dev-journal/2026-06.md)
- **2026-06-13 — --no-prune flag** — orphan pruning ON by default; `--no-prune` for faster runs or concurrent-import safety; two list-API walks per project (dedup + prune) deferred as premature at current gallery sizes. [source](dev-journal/2026-06.md)

## Incidents of note

- **2026-04 — Production 500 from `Date.getTime()` on cache-hit string** — `unstable_cache` serializes return values; `Date.getTime()` called on a cache-hit string (not a `Date`) threw at runtime. Fix: normalize inside the cached function. [source](dev-journal/2026-04.md)
- **2026-05 — Time-based publishing reversed three times** — filter-inside-cached-fn (wrong epoch), then read-time + padded TTL (correct direction but brittle), then `isFutureDatetime(datetime, now)` with required `now` (stable). Lesson: cache epoch ≠ render epoch. [source](dev-journal/2026-05.md)
- **2026-05 — happy-dom `<form>` Proxy identity bug** — `<form>` element returned by happy-dom fails reference equality with a Proxy wrapper; `form.reset()` call on the Proxy throws; diagnosed but not fixed (framework-level issue). [source](dev-journal/2026-05-18.md)
- **2026-05 — Session lockout from `cd src/lib`** — auto-allow hook used project-root-relative paths; `cd src/lib` changed `pwd` causing hook path resolution to fail; Claude Code blocked all commands. Lesson: hooks must use absolute paths or never `cd` inside the project. [source](dev-journal/2026-05-18.md)
- **2026-05-20 — Detail page 500 from null `platformTags`** — `@default([])` on `platformTags` absent in initial migration; rows created before migration had `null` instead of `[]`; `.map()` on null threw. Fixed by adding `@default([])` and re-migrating. [source](dev-journal/2026-05-20.md)
- **2026-06-09/13 — Blob list pagination first-page only** — `list({ prefix })` only walked page 1; projects with >1000 blobs silently missed later pages; treated existing blobs as absent and re-uploaded. Fixed with `hasMore`/cursor loop. [source](dev-journal/2026-06.md)
- **2026-06-09 — localhost:300 typo in seed-projects.ts** — three entries used `localhost:300` instead of `localhost:3000`; broken anchors on local demo. Fixed in 06-13 batch. [source](dev-journal/2026-06.md)

## Timeline

- **2026-04** — DRY sweep (96 files, 10 commits); `React.cache()` per-request dedupe; catch-all legacy redirect page; `KNOWN_ROUTES` dissolved; Atom feed quality (`stripMarkdown`, `escapeCdata`); `unstable_cache` discipline; security hardening (hex check, `EnvConfigError`, module-load bcrypt, `timingSafeEqual`). [source](dev-journal/2026-04.md)
- **2026-05** — Code-review-driven cadence; time-based publishing (3 reversals); audit log typed union; `useOptimisticMutation` race fix; Upstash keepalive; bulk import (`bulkImportParser.ts`, `createManyAndReturn + skipDuplicates`); security (`sanitizeLogString`, HMAC, `/api/admin/upload`); a11y (carousel APG, `<main>` root, `<time dateTime>`); `Post.summary` required; 6-bucket lib reorg; `PlatformBucket`/`PlatformTag[]`; test speedup (~47%). [source](dev-journal/2026-05.md)
- **2026-05-17** — `/api/admin/upload`; `BooleanFlagToggle`; `isFutureDatetime(now required)`; `batchId`; lazy keepalive; optimistic-toggle revert fix. [source](dev-journal/2026-05-17.md)
- **2026-05-18** — `Post.summary NOT NULL`; `deriveSummary`; bcrypt mock speedup; `AnimatePresence mode="sync"`; 6-bucket reorg commit `8d8fa8b`. [source](dev-journal/2026-05-18.md)
- **2026-05-20** — `PlatformBucket` enum + `PlatformTag[]`; two-phase deploy; `@default([])` fix. [source](dev-journal/2026-05-20.md)
- **2026-05-21** — Coherence `superRefine`; picker UX; gallery/admin split; 6 of 10 findings false positives. [source](dev-journal/2026-05-21.md)
- **2026-05-22** — `nextCacheSpyFactory`; `mockPickerConfig.autoFill` modes. [source](dev-journal/2026-05-22.md)
- **2026-06** — Manifest-driven importer (`blobSync.ts`, `BlobStore` DI, content-addressed keys, orphan pruning, pagination); Continuum legal pages cluster (`LegalPageLayout`, `AppleLegalLink`, `continuumLegalLinks.ts`); per-IP rate limiting (`IP_HASH_SECRET`, keyspace partition, log split, 5 tests); `FeaturedProjectCard` equal-height flexbox; Twitter → Bluesky contact link. [source](dev-journal/2026-06.md)
