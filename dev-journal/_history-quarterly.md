# Rolling History — last 90 days (through 2026-06-08)

## Themes

- **Security hardening — depth over breadth** — April established the foundation: `EnvConfigError` type for env-load errors, module-load `bcrypt` pattern, `crypto.timingSafeEqual` for auth comparisons (04-26). May deepened: HMAC-SHA256 IP pseudonymization for rate-limiting (plain SHA-256 reversible over ~4B IPv4 keyspace); `/api/upload` under `/api/admin/upload` (single proxy.ts gate, eliminates exact-match bypass risk); `AdminAuditTag` typed closed union + `AdminAuditPayload.batchId` required (closed audit-log structural drift); `sanitizeLogString` for multipart-parser errors (log injection). GDPR posture: HMAC blocks rainbow-table, `@upstash/ratelimit` library TTL covers retention, policy mention covers transparency. [source](dev-journal/2026-04.md) [source](dev-journal/2026-05.md)

- **`unstable_cache` discipline** — April hit a production 500 from `Date` serialization inside a cached function; established Map-memoized wrappers as the pattern. May refined: caches that "capture `now`" break time-based publishing; fix is to push the time-dependent filter *out* of the cached function into the caller wrapper (three-reversal arc). `isFutureDatetime(datetime, now)` with required `now` prevents the `vi.mock` intra-module reference trap and allows multi-iteration callers to capture one `now` per batch. [source](dev-journal/2026-04.md) [source](dev-journal/2026-05-14.md) [source](dev-journal/2026-05-17.md)

- **Platform taxonomy refactor** — Three-prose-derivation-algorithm smell: `Project.platform: String` required three separate algorithms (bucket grouping, display, redundancy). Replaced with `bucket: PlatformBucket` + `platformTags: PlatformTag[]` as Postgres enums (05-20); `compactLabel` rules with family-set Fullstack detection; browser-safe `@generated/prisma/enums` (Prisma 7) fixed Turbopack `node:module` crash; `superRefine` coherence gate shared across create/update (05-21); two-phase deployment accepted a brief broken window. [source](dev-journal/2026-05-20.md) [source](dev-journal/2026-05-21.md)

- **Audit log shape and observability** — April established structured audit payloads. May iterated: `AdminAuditTag` typed union from `const ADMIN_AUDIT_TAGS=[…]as const`, `AdminAuditPayload` required `T|null` for all keys (structural drift surfaces at tsc), `batchId: string|null` required for bulk-import correlation, `[api:admin:posts:BULK]` tag, `sanitizeLogString` in multipart paths. [source](dev-journal/2026-04.md) [source](dev-journal/2026-05.md)

- **Code-review-driven cadence** — April's DRY sweep (96 files, 10 commits on 04-17) pioneered the "review first, then fix" cycle. May operationalized it: daily reviews driving 17→24→12→7→6 commit days; `useOptimisticMutation` extracted at 2nd consumer, `readErrorMessage` at 5th. The `src/lib/` 6-bucket reorg (db/auth/api/content/client/utils, 140 files, 220 import rewrites) emerged from this cadence. By 05-22, each day's delta reviews-and-closes in one follow-up. [source](dev-journal/2026-04.md) [source](dev-journal/2026-05.md)

- **`useOptimisticMutation` lifecycle** — Extracted at 2nd consumer (05-12); unmount-after-resolve race fixed by nulling `abortRef.current` (05-13); `MutateResult` discriminant (`{ok:true}|{ok:false;reason:"failure"|"superseded"}`); `BooleanFlagToggle` collapsed from `PostPublishedToggle` + `IsFeaturedToggle` (05-17) with stale-revert bug fixed (capture `prev = isOn` before optimistic flip, not `initialProp`). [source](dev-journal/2026-05.md)

- **A11y structural cleanup** — `<main>` hoist to root layout (15 pages changed), `<time dateTime>` ISO 8601 fix via `postDatetimeToISO`, carousel APG `aria-roledescription="carousel"`, skip-link `#main-content`, `ProjectContent` tablist roving `tabIndex`, `PrivacyPageLayout <main>→<div>` (two-landmark regression fix). [source](dev-journal/2026-05.md)

- **Manifest-driven project importer (June)** — `scripts/import-projects.ts` with per-project `project.json` manifest + `app-copy-to-project` skill; Direct Prisma + Blob with deterministic keys (`projects/<slug>/<path>`); reuses `projectCreateSchema`/`projectMappers.ts`; `scripts/` gitignore narrowed from whole-dir to `scripts/imports/`. Deliberately omits MIME/size checks (trusted first-party files). [source](dev-journal/2026-06.md)

## Decisions of note

- **2026-04-17 — Broad codebase DRY sweep** — 96 files, 10 commits; `React.cache()` dedupe, `Section` closed union, `SiteChrome.tsx` deleted. [source](dev-journal/2026-04.md)
- **2026-04-17 — Legacy redirect catch-all** — `[slug]/page.tsx` catch-all over DB lookup; `KNOWN_ROUTES` dissolved. [source](dev-journal/2026-04.md)
- **2026-04-XX — `unstable_cache` Map-memoized wrappers** — after production 500 from `Date` serialization inside a cached function. [source](dev-journal/2026-04.md)
- **2026-05-12 — `AdminAuditTag` typed union** — derived from `const ADMIN_AUDIT_TAGS=[…]as const`; structural drift surfaces at tsc. [source](dev-journal/2026-05-12.md)
- **2026-05-14 — HMAC-SHA256 IP pseudonymization** — fail-open on missing `IP_HASH_SECRET`; HMAC blocks rainbow-table precomputation. [source](dev-journal/2026-05-14.md)
- **2026-05-14 — Scheduled publishing via read-time filter** — padded bounded caches (`take: LIMIT + futureCount`); `totalPages` moved to request-time count. [source](dev-journal/2026-05-14.md)
- **2026-05-17 — `isFutureDatetime(datetime, now)` required `now`** — `vi.mock` intra-module reference trap makes default optional version untestable; multi-iteration callers capture one `now` per batch. [source](dev-journal/2026-05-17.md)
- **2026-05-17 — `BooleanFlagToggle` collapse** — stale-revert: capture `prev = isOn` before optimistic flip, not `initialProp` (stale after `router.refresh()`). [source](dev-journal/2026-05-17.md)
- **2026-05-18 — `Post.summary: String NOT NULL`** — `deriveSummary` word-boundary truncation; `SUMMARY_MAX_CHARS = 160`; read-time fallbacks deleted (genuinely dead after NOT NULL). [source](dev-journal/2026-05-18.md)
- **2026-05-20 — `Project.platform` → `bucket + platformTags` enums** — three derivation algorithms replaced by structured storage; `@generated/prisma/enums` for browser safety. [source](dev-journal/2026-05-20.md)
- **2026-05-21 — `superRefine` bucket/tag coherence** — single refine shared create/update; uses `BUCKET_SUGGESTED_TAGS` not `BUCKET_NATURAL_TAGS` (mirrors picker surface). [source](dev-journal/2026-05-21.md)
- **2026-06-08 — Manifest-driven project importer** — Direct Prisma + Blob over admin HTTP API (random blob keys, auto-slug/sortOrder-shift); `project.json` over raw-markdown parsing (no stable schema); `projectCreateSchema` for data-integrity. [source](dev-journal/2026-06.md)

## Incidents of note

- **2026-04-XX — Production 500 from `Date` in `unstable_cache`** — Next.js can't serialize `Date` across the cache boundary; Map-memoized wrappers fix. [source](dev-journal/2026-04.md)
- **2026-05-14 — Upstash idle warnings despite `0 0 1,11,21 * *`** — 10-11 day gaps exceed Upstash ~7-day free-tier idle threshold; fixed → daily `0 0 * * *`. [source](dev-journal/2026-05-14.md)
- **2026-05-14 — Admin dashboard N background RSC requests** — `<Link>` prefetches on viewport entry; per-row edit links triggered N parallel Prisma queries. Fix: `prefetch={false}` on per-row edit links. [source](dev-journal/2026-05-14.md)
- **2026-05-17 — Optimistic-toggle stale-revert** — `onRevert` captured `initialProp` (stale after `router.refresh()`); fix: capture `prev = isOn` before flip. [source](dev-journal/2026-05-17.md)
- **2026-05-17 — `createManyAndReturn + skipDuplicates` silent drop** — concurrent insert loser never appeared in `skipped`; fix: post-insert slug-set diff. [source](dev-journal/2026-05-17.md)
- **2026-05-18 — Bash `cd src/lib` session lockout** — hooks reference relative script path; `cd` into subdir resolved hook to nonexistent path, blocked every tool call until session restart. Never `cd` into a subdirectory mid-session. [source](dev-journal/2026-05-18.md)
- **2026-05-20 — Turbopack `node:module` crash** — `platforms.ts` imported `PlatformBucket` from `@/generated/prisma/client`, dragging Prisma runtime into browser bundle. Fix: `@generated/prisma/enums`. [source](dev-journal/2026-05-20.md)
- **2026-06-08 — `scripts/` wholly gitignored** — root `.gitignore` `scripts/` would have silently excluded the new importer and existing seeds; `db:import-projects` would break on fresh clone. Fixed: narrowed to `scripts/imports/`. [source](dev-journal/2026-06.md)

## Timeline

- **2026-04-17** — DRY sweep (96 files, 10 commits); catch-all legacy redirect; Atom feed AST strip; security batch; `unstable_cache` Map-memoized wrappers. [source](dev-journal/2026-04.md)
- **2026-05-09** — Cleanup: `<Link>`/`<a>` revert, `ClientAnalytics` move, CSS merge. [source](dev-journal/2026-05-09.md)
- **2026-05-11–13** — 3-session review: audit log, `<main>` hoist, `readErrorMessage`, `useOptimisticMutation`, `AdminAuditTag`, `Post.slug` index. [source](dev-journal/2026-05-12.md)
- **2026-05-14** — Keepalive → daily cron; HMAC IP pseudonymization; scheduled publishing (read-time filter + padded bounded caches). [source](dev-journal/2026-05-14.md)
- **2026-05-15** — Bulk import (`bulkImportParser.ts`, `createManyAndReturn`); `writeKeepalive` extraction. [source](dev-journal/2026-05-15.md)
- **2026-05-17** — `/api/upload` → `/api/admin/upload`; `BooleanFlagToggle`; `isFutureDatetime(now required)`; stale-revert fix; bulk concurrent-write reconcile. [source](dev-journal/2026-05-17.md)
- **2026-05-18** — `Post.summary NOT NULL` + `deriveSummary`; test speedup 47%; `src/lib/` 6-bucket reorg `8d8fa8b`; session-lockout incident. [source](dev-journal/2026-05-18.md)
- **2026-05-20** — `Project.platform` → `bucket + platformTags` enums; `compactLabel`; browser-safe import fix; Turbopack crash resolved. [source](dev-journal/2026-05-20.md)
- **2026-05-21** — `superRefine` coherence; picker submit-gate; `getProjectsGalleryCached`/`getProjectsForAdmin` split. [source](dev-journal/2026-05-21.md)
- **2026-05-22** — Cache-wrap snapshot test (`nextCacheSpyFactory`); `mockPickerConfig.autoFill` enum union. [source](dev-journal/2026-05-22.md)
- **2026-06-08** — Manifest-driven project importer; `projectMappers.ts`/`projectImport.ts`; `scripts/` gitignore fix. [source](dev-journal/2026-06.md)
