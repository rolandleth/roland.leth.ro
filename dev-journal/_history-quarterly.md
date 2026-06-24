# Rolling History — last 90 days (through 2026-06-22)

## Themes

- **Security hardening in layers** — April: hex Zod check on `ADMIN_HASH_PASSWORD`; `EnvConfigError` typed with `code`/`varName`; module-load dummy `bcrypt.hashSync` (~80ms, timing defense); `getRedisConfig()` centralised; `crypto.timingSafeEqual` for cron Bearer. May: per-IP login rate-limit (`@upstash/ratelimit` `slidingWindow`); `ALLOW_UPLOADS` env flag; magic-byte `detectImageMime` sniff on upload route; `sanitizeLogString` (strips CR/LF/TAB/NUL, clamps to 200 chars) closes log-injection vector; `IP_HASH_SECRET` env var + HMAC-SHA256 (IPv4 keyspace ~4B, plain SHA-256 reversible — HMAC with server secret blocks rainbow tables). June: HMAC keying active; keyspace partitioned (`ip:<hash>` vs `"global"`); bucket key hoisted (HMAC once per request). Sources: [dev-journal/2026-04.md](dev-journal/2026-04.md), [dev-journal/2026-05.md](dev-journal/2026-05.md), [dev-journal/2026-06.md](dev-journal/2026-06.md).

- **Caching discipline + data access patterns** — `unstable_cache` (April): normalize inside the cached fn, not at read sites (`Date.getTime()` explodes on cache hits when JSON-serialized); Map-memoized slug wrappers for per-slug tags. Scheduled publishing evolution (May): filter `datetime <= now` initially captured inside cached fn → reversed 2026-05-14 to time-independent cache + read-time filter (scheduled posts auto-surface first request after `datetime` passes; cache pads with `LIMIT + futureCount`). June: content-addressed blob keys (`SHA256[:12]`) for CDN cache-busting; paginated `listProjectBlobs` via `hasMore`/cursor. Sources: [dev-journal/2026-04.md](dev-journal/2026-04.md), [dev-journal/2026-05.md](dev-journal/2026-05.md), [dev-journal/2026-06.md](dev-journal/2026-06.md).

- **Admin tooling build-out** — Audit log: fixed 6-key payload (2026-05-11) → `AdminAuditTag` typed union (05-12) → `const ADMIN_AUDIT_TAGS as const` derived union (05-13) → `batchId: string | null` for bulk-run grep (05-17); durable audit sink via `console.info` is a deliberate trade, not a gap to fix. Bulk post import (05-15): `/admin/posts/bulk`, `bulkImportParser.ts`, `createManyAndReturn + skipDuplicates`, post-insert slug-set diff, `FILENAME_REGEX` title group, 50-file / 100KB cap. Project importer (June): manifest-driven `project.json`, `blobSync.ts` `BlobStore` DI, orphan pruning. Sources: [dev-journal/2026-05.md](dev-journal/2026-05.md), [dev-journal/2026-06.md](dev-journal/2026-06.md).

- **Code-review-driven implementation cadence** (May) — Daily review → multi-phase commit pattern: 05-07 (17 commits, 721→840 tests), 05-11 (24 commits, 980 tests), 05-12 (12 commits), 05-13 (7 commits, 998 tests), 05-17 (6 phase-aligned commits). Each commit green at boundary (tsc + lint + tests); intermediate-state authoring for files spanning two phases (backup to `/tmp`, restore). Source: [dev-journal/2026-05.md](dev-journal/2026-05.md).

- **A11y + structural improvements** (May) — Carousel APG (`role="group"`, `aria-live="polite"`, padded-button dot indicators replacing `before:-m-2.5`); skip link wrapping `#main-content`; `<time dateTime>` corrected to ISO 8601 (was emitting internal `yyyy-MM-dd-HHmm`); `<main>` hoisted from per-page into root layout (one landmark per document, 14 pages converted). `PrivacyPageLayout.tsx` missed the hoist sweep — watch-out's explicit trigger fired on the pre-existing page. Sources: [dev-journal/2026-05.md](dev-journal/2026-05.md).

## Decisions of note

- **2026-04-17 — Catch-all `[slug]` page replaces `/api/legacy-redirect/`** — `KNOWN_ROUTES` dissolved; static routes are Next.js' own allowlist; `permanentRedirect(308)` on hit, `notFound()` on miss. [source](dev-journal/2026-04.md)
- **2026-04-20 — Normalize `updatedAt` inside cached fn** — cache contract "strings in, strings out"; handler never branches on fresh vs cached value. [source](dev-journal/2026-04.md)
- **2026-04-26 — Module-load dummy bcrypt** — `bcrypt.hashSync("dummy", 10)` at import time (~80ms); timing-defense in no-credentials path. [source](dev-journal/2026-04.md)
- **2026-05-07 — `parseJsonBody` logs paths only, never values** — pinned with test "submitted value never appears in log calls". [source](dev-journal/2026-05.md)
- **2026-05-14 — Read-time filter for scheduled posts** — cache becomes time-independent; JS filter applies fresh `now` per request; padded caches with `LIMIT + futureCount`. [source](dev-journal/2026-05.md)
- **2026-05-17 — `/api/upload` moved to `/api/admin/upload`** — auth-gated by the generic `startsWith("/api/admin/")` gate; one namespace, one gate. [source](dev-journal/2026-05.md)
- **2026-05-18 — `src/lib/` 6-bucket reorganization** — `db/`, `auth/`, `api/`, `content/`, `client/`, `utils/`; 140 files, 220 import paths rewritten; single atomic commit `8d8fa8b`. [source](dev-journal/2026-05.md)
- **2026-06-08 — Manifest-driven project import over admin HTTP API** — `project.json` as source of truth; direct Prisma write (skips Next cache revalidation — paired with deploy). [source](dev-journal/2026-06.md)
- **2026-06-10 — Content-addressed blob keys** — `SHA256[:12]`; same bytes = same key (reuse); changed bytes = new key (CDN cache-bust). [source](dev-journal/2026-06.md)
- **2026-06-13 — `blobSync.ts` with `BlobStore` DI interface** — pure `projectImport.ts` logic + I/O shell; unit-testable with in-memory fakes. [source](dev-journal/2026-06.md)

## Incidents of note

- **2026-04-17 — Parallel subagent collision** — Round 1 agents shared the checkout; Agent 1a saw Agent 1b's uncommitted edits and tried `git stash`. Fix: serial rounds with commit-between. [source](dev-journal/2026-04.md)
- **2026-04-20 — 500 on `/api/feed/tech`** — `TypeError: Date.getTime()` on `unstable_cache` hit; JSON-serialization turns `DateTime` into strings; normalize inside cached fn. [source](dev-journal/2026-04.md)
- **2026-05-07 — Edit-page tests had never run** — `vitest.config.ts` glob excluded `src/app/**/*.test.tsx`; two tests silently skipped. [source](dev-journal/2026-05.md)
- **2026-05-11 — `legacySlug.cachedLookup` missed future-dated filter** — added `datetime <= now` to `getPostBySlug` etc but legacy-slug lookup only filtered `published: true`; future-dated published post would 308 to a page that 404s. [source](dev-journal/2026-05.md)
- **2026-05-13 — `PrivacyPageLayout.tsx` dual `<main>` regression** — missed by the 11-commit hoist sweep; both `/privacy` and `/privacy/body-tracking` had two landmarks. [source](dev-journal/2026-05.md)
- **2026-05-17 — Optimistic-toggle revert used stale baseline** — `onRevert` captured first-render `initial` prop; after successful toggle + `router.refresh()`, a subsequent failed toggle reverted to the now-stale baseline. Fixed: `const prev = isOn` before optimistic `setIsOn(next)`. [source](dev-journal/2026-05.md)
- **2026-05-18 — Session lockout from `cd src/lib`** — changing directory mid-session caused `.claude/hooks/` relative path to resolve incorrectly, blocking tool calls. [source](dev-journal/2026-05.md)
- **2026-06-08 — `scripts/` wholly gitignored** — root `.gitignore` line `scripts/` prevented `import-projects.ts` from being committed. Fixed: narrowed to `scripts/imports/`. [source](dev-journal/2026-06.md)
- **2026-06-10/13 — Blob list pagination gap** — `list({ prefix })` walked page 1 only; projects with >1000 blobs silently missed later pages. Fixed: `hasMore`/cursor loop. [source](dev-journal/2026-06.md)

## Timeline

- **2026-04-16** — Prisma OR filter for `searchPosts`; `SectionManager` stable crypto keys. [source](dev-journal/2026-04.md)
- **2026-04-17** — Catch-all `[slug]` page; `React.cache()` per-request dedupe; `Section` as DB enum; `Header.tsx` absorbs pathname-hide; `KNOWN_ROUTES` dissolved. [source](dev-journal/2026-04.md)
- **2026-04-20** — `unstable_cache` normalize-inside discipline; Map-memoized slug wrappers; `stripMarkdown` AST walk. [source](dev-journal/2026-04.md)
- **2026-04-21** — `escapeCdata` helper; image/imageReference alt in `extractText`; typed mdast walk via `Nodes` import. [source](dev-journal/2026-04.md)
- **2026-04-26** — Hex Zod check on `ADMIN_HASH_PASSWORD`; `EnvConfigError` typed; dummy bcrypt; `getRedisConfig()` centralised; `crypto.timingSafeEqual` cron Bearer. [source](dev-journal/2026-04.md)
- **2026-05-07** — Per-IP login rate-limit; `ALLOW_UPLOADS` env flag; magic-byte `detectImageMime`; cross-section cache invalidation reads prior section; admin page split to `PostsTab`+`ProjectsTab`. [source](dev-journal/2026-05.md)
- **2026-05-09** — Reverted `<Link>`→`<a>` for non-route hrefs; dropped `error.digest`; error boundary RTL tests. [source](dev-journal/2026-05.md)
- **2026-05-11** — Scheduled publishing filter; cron 401 on missing secret; `auditLog(tag, AdminAuditPayload)` unified. [source](dev-journal/2026-05.md)
- **2026-05-12** — `<main>` hoisted to root layout (14 pages converted); Posts PUT Serializable isolation; `Post.slug` index; `useOptimisticMutation` extracted at 2nd consumer. [source](dev-journal/2026-05.md)
- **2026-05-13** — `sanitizeLogString` closes log-injection vector; `useOptimisticMutation` unmount-after-resolve race fixed; `PrivacyPageLayout.tsx` dual `<main>` fixed. [source](dev-journal/2026-05.md)
- **2026-05-14** — Read-time filter pivot; `IP_HASH_SECRET` + HMAC; Vercel cron → daily; `prefetch={false}` on admin edit links; keepalive admin route. [source](dev-journal/2026-05.md)
- **2026-05-15** — Bulk import: `POST /api/admin/posts/bulk`, `bulkImportParser.ts`, `createManyAndReturn + skipDuplicates`, batchId audit stamp. [source](dev-journal/2026-05.md)
- **2026-05-17** — `/api/upload` → `/api/admin/upload`; `BooleanFlagToggle`; `isFutureDatetime(datetime, now)`. [source](dev-journal/2026-05.md)
- **2026-05-18** — `Post.summary` NOT NULL + `deriveSummary` 160-char word-boundary; 47% test speedup; `src/lib/` 6-bucket reorganization. [source](dev-journal/2026-05.md)
- **2026-06-08** — Manifest-driven import; `PrivacyPageLayout` DRY; `AppleLegalLink`; `scripts/` gitignore narrowed; Reckon accent `#B5673F`. [source](dev-journal/2026-06.md)
- **2026-06-10** — Keys → `SHA256[:12]`; `IP_HASH_SECRET` HMAC + global-bucket fallback; Continuum DPIA + responsible-use pages. [source](dev-journal/2026-06.md)
- **2026-06-13** — `blobSync.ts` (`BlobStore` DI, paginated listing, 4-concurrent, `pruneOrphans`); hash 48→64-bit; `LegalPageLayout` generalized; keyspace partitioned; HMAC hoisted; log levels split; `FeaturedProjectCard` equal-height chain; hook migration `web-auto-allow.jq` (`slug=rlr`); Twitter/X → Bluesky; AT Protocol handle verified. [source](dev-journal/2026-06.md)
