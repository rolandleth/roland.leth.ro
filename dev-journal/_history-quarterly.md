# Rolling History — last 90 days (through 2026-05-18)

## Themes

- **Broad DRY sweep (April)** — systematic deduplication across `lib/`, components, and API routes. Map-memoized wrappers extracted; `unstable_cache` normalize moved inside the cached function so call sites can't diverge on key shape; repeated query patterns unified. [source](dev-journal/2026-04.md)

- **Legacy redirect rethink (April)** — legacy redirect structure audited; paths either promoted to permanent redirects or removed. Atom feed redirect behaviour formalized alongside feed quality improvements. [source](dev-journal/2026-04.md)

- **Atom feed quality and markdown/AST infrastructure (April)** — `escapeCdata` helper added; typed `mdast` walk; `markdownToHtml` drops raw HTML (2026-04-21); `stripMarkdown` via AST walk (2026-04-20). Feed content safe for strict CDATA consumers. This infrastructure later underpins `deriveSummary` (2026-05-18). [source](dev-journal/2026-04-21.md)

- **Security hardening (April–May)** — `EnvConfigError` type replaces generic throws at env-load; `bcrypt` module-load pattern; Redis constructor mock fixed; `timingSafeEqual` for auth comparisons (2026-04-26). Continued through May code reviews: endpoint input validation, auth boundary audit. [source](dev-journal/2026-04-26.md)

- **`unstable_cache` discipline** — normalize inside function established as invariant (April); code-review series reinforced the pattern across May. Prevents cache-key collisions from inconsistent normalization paths. [source](dev-journal/2026-04.md)

- **Code-review cadence and structural improvements (May)** — 11 reviews across 12 days (2026-05-07 to 2026-05-18). Standing flags: `PostForm` shared mutation state, optimistic mutation rollback gaps, missing error boundaries, A11y compliance. Most findings resolved within sessions. [source](dev-journal/2026-05-18.md)

- **`src/lib/` 6-bucket reorganization (May)** — `db/`, `auth/`, `api/`, `content/`, `client/`, `utils/`; 140 files, 220 imports, committed `8d8fa8b`. Residual boundary misassignments flagged: `keepalive` in `api/`, `boundedCache` in `db/`, `theme.ts` in `client/` (server surface), `auth/env.ts` creates `db→auth` dependency. [source](dev-journal/2026-05-18.md)

- **Post.summary derivation (May)** — `Post.summary` `String?` → `NOT NULL`; `deriveSummary(body)` strips markdown, 160-char word-boundary truncation (`SUMMARY_MAX_CHARS = 160`), hard-slice fallback; edit-route resolution logic (authored→keep, cleared→re-derive, body-changed-untouched→re-derive); `read-time` fallbacks deleted. Deploy requires `db:push` + backfill. [source](dev-journal/2026-05-18.md)

- **Test infrastructure speedup (May)** — `setupUser({ delay: null })` project-wide; `AnimatePresence mode="sync"` global mock in `setup.dom.ts`; 21 test files migrated; ~47% speedup (8.91s → 4.69s). Happy-dom Proxy identity bug diagnosed but not fixed. [source](dev-journal/2026-05-18.md)

## Decisions of note

- **2026-04-XX — unstable_cache normalize inside fn** — normalization moved inside the cached function; call sites can't diverge on key shape silently. Alternative (normalize at call site) rejected as too easy to get wrong. [source](dev-journal/2026-04.md)
- **2026-04-26 — bcrypt module-load** — `bcrypt` loaded at module initialization rather than per-call; removes repeated require overhead on auth-heavy paths. [source](dev-journal/2026-04-26.md)
- **2026-05-18 — Post.summary NOT NULL** — `String?` removed; every post has a summary (derived if not authored). Deploy order matters: `db:push` must precede backfill, backfill must precede API surfaces expecting non-null. [source](dev-journal/2026-05-18.md)
- **2026-05-18 — deriveSummary word-boundary truncation** — `SUMMARY_MAX_CHARS = 160`; truncates at last word boundary before limit, hard-slice fallback if no space found. Watch-out: `lastSpace > 0` guard may return empty string on edge inputs. [source](dev-journal/2026-05-18.md)
- **2026-05-18 — setupUser({ delay: null })** — shared `setupUser` instance adopted for speed; fragility noted (shared state leaks between tests if not reset). Global `mode="sync"` for `AnimatePresence` masks animation-ordering bugs — trade-off accepted for now. [source](dev-journal/2026-05-18.md)
- **2026-05-18 — src/lib/ 6-bucket split** — feature-group over flat `lib/`; 6 buckets match natural dependency tiers. Four residual misassignments not fixed in the initial commit; flagged for follow-up. [source](dev-journal/2026-05-18.md)

## Incidents of note

- **2026-05-18 — Session lockout from `cd src/lib` + relative hook path** — running `cd src/lib` mid-session caused all subsequent relative hook paths to resolve incorrectly; Claude was locked out and the user had to restart the session. Avoid `cd` during active sessions when hooks use relative config paths. [source](dev-journal/2026-05-18.md)

## Timeline

- **2026-04-01–19** — DRY sweep; legacy redirects rethought; Atom feed quality; `unstable_cache` discipline; security hardening. [source](dev-journal/2026-04.md)
- **2026-04-20** — `unstable_cache` normalize inside fn; `stripMarkdown` via AST. [source](dev-journal/2026-04-20.md)
- **2026-04-21** — `escapeCdata`; typed `mdast` walk; `markdownToHtml` drops raw HTML. [source](dev-journal/2026-04-21.md)
- **2026-04-26** — Security hardening: `EnvConfigError`, module-load `bcrypt`, `timingSafeEqual`; Redis mock fix. [source](dev-journal/2026-04-26.md)
- **2026-05-07** — Code-review series started (Review 1). [source](dev-journal/2026-05-07.md)
- **2026-05-07–17** — Reviews 2–10: scheduled publishing, audit log, optimistic mutations, keepalive, bulk import, A11y. [source](dev-journal/2026-05-17.md)
- **2026-05-18** — `Post.summary` NOT NULL + `deriveSummary` (Session 1); ~47% test speedup (Session 2); `src/lib/` 6-bucket reorg `8d8fa8b`, session lockout incident (Session 3). [source](dev-journal/2026-05-18.md)
