# Rolling History — last 30 days (through 2026-05-20)

## Themes

- **`Project.platform` structural rewrite** — 2026-05-20: replaced free-text `Project.platform: String` (comma-separated keywords) with `bucket: PlatformBucket` (enum, 4 values) + `platformTags: PlatformTag[]` (enum, 19 values). Eliminated three separate derivation algorithms in `src/lib/utils/platforms.ts` (regex word-boundary keyword matching for buckets, comma-split + set membership for display, prefix/substring for redundancy) that were each reverse-engineering structure from prose. `PlatformPicker` rewritten as bucket radio + tag chips scoped to `BUCKET_SUGGESTED_TAGS[bucket]`; OpenSource surfaces every tag since OSS spans platforms. New `compactLabel(bucket, tags)` rules: in-family multi-tags collapse to bucket label (`iOS + iPad → "iOS"`), Web + Frontend + Backend → "Fullstack", outside-family → "Multiplatform"; `detailLabel(bucket, tags)` renders honest stack via `tags.join(" + ")` on detail pages. Phase 1 (additive schema + `scripts/backfillBuckets.ts` + disposable `/admin/migrate-buckets` review page) deployed against prod mid-session; phase 2 (NOT NULL `bucket`, drop `platform`, full code rewrite, disposable scaffolding removed) committed as `ecc86d1`, pending `db:push` + deploy. [source](dev-journal/2026-05-20.md)

- **`src/lib/` 6-bucket reorganization** — 2026-05-18 (Session 3): `src/lib/` split into `db/`, `auth/`, `api/`, `content/`, `client/`, `utils/`; 140 files touched, 220 imports updated, committed as `8d8fa8b`. Residual misassignments flagged: `keepalive` in `api/` (should be `utils/`), `boundedCache` in `db/` (should be `utils/`), `theme.ts` in `client/` (has server surface), `auth/env.ts` creates `db→auth` dependency. Session lockout incident from `cd src/lib` + relative hook path; user restarted. [source](dev-journal/2026-05-18.md)

- **Post.summary derivation** — 2026-05-18 (Session 1): `Post.summary` column changed from `String?` to `String NOT NULL`; `deriveSummary(body)` strips markdown via AST, word-boundary truncation at 160 chars (`SUMMARY_MAX_CHARS = 160`), hard-slice fallback; edit-route resolution logic (authored→keep, cleared→re-derive, body-changed-untouched→re-derive, body-unchanged-untouched→skip); `read-time` fallbacks deleted. Needs `yarn db:push` + backfill before deploy. [source](dev-journal/2026-05-18.md)

- **Test infrastructure speedup** — 2026-05-18 (Session 2): `setupUser({ delay: null })` adopted project-wide; `AnimatePresence mode="sync"` global mock in `setup.dom.ts`; 21 test files migrated; ~47% speedup (8.91s → 4.69s). Happy-dom Proxy identity bug diagnosed but not fixed. [source](dev-journal/2026-05-18.md)

- **Code-review cadence (Reviews 1–11, May)** — 11 reviews across 12 days established a recurring quality audit loop. Standing flags: `unstable_cache` discipline, `PostForm` shared mutation state, optimistic mutation rollback gaps, missing error boundaries. Most findings resolved within sessions; open items tracked in code-reviews/2026-05.md. [source](dev-journal/2026-05-18.md)

- **Security hardening (late April)** — `EnvConfigError` type replaces generic throws at env-load; `bcrypt` module-load pattern; Redis constructor mock fixed; `timingSafeEqual` for auth comparisons (2026-04-26). Continued through code reviews in May. [source](dev-journal/2026-04-26.md)

- **Markdown/AST infrastructure** — `stripMarkdown` via AST walk (2026-04-20); `escapeCdata` helper; typed `mdast` walk; `markdownToHtml` drops raw HTML (2026-04-21). Provides the foundation `deriveSummary` relies on (2026-05-18). [source](dev-journal/2026-04-21.md)

## Timeline

- **2026-04-20** — `unstable_cache` normalize inside fn; Map-memoized wrappers; `stripMarkdown` via AST. [source](dev-journal/2026-04-20.md)
- **2026-04-21** — `escapeCdata` helper; typed `mdast` walk; `markdownToHtml` drops raw HTML. [source](dev-journal/2026-04-21.md)
- **2026-04-26** — Security hardening: `EnvConfigError`, module-load `bcrypt`, Redis config, `timingSafeEqual`; Redis constructor mock fix. [source](dev-journal/2026-04-26.md)
- **2026-05-07** — Code-review series started (Review 1). [source](dev-journal/2026-05-07.md)
- **2026-05-07–17** — Reviews 2–10: scheduled publishing, audit log, optimistic mutations, keepalive, bulk import, A11y flagged and incrementally resolved. [source](dev-journal/2026-05-17.md)
- **2026-05-18** — `Post.summary` NOT NULL + `deriveSummary(body)` at 160 chars (Session 1); `setupUser({ delay: null })` + global `mode="sync"` mock, ~47% test speedup (Session 2); `src/lib/` 6-bucket reorg 140 files `8d8fa8b`, session lockout incident (Session 3). [source](dev-journal/2026-05-18.md)
- **2026-05-20** — `Project.platform` free-text → `bucket: PlatformBucket` + `platformTags: PlatformTag[]`; `PlatformPicker` bucket-radio + tag-chips; `compactLabel`/`detailLabel` in `src/lib/utils/platforms.ts`; phase 1 schema deployed mid-session, phase 2 commit `ecc86d1` pending `db:push`. [source](dev-journal/2026-05-20.md)
