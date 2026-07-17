# Plan: per-post cache revalidation failure + stale-404 hardening

Status: Phase 2 + tests SHIPPED 2026-07-17 (commits 07502c9, 2ab29a3) — all four
detail lookups (posts, projects, guides, guide topics) now throw-on-miss so a
`null` is never durably cached; revalidate endpoint returns
`{ ok, applied, skipped }` and the panel warns on skipped entries; detail tags
single-sourced per module; import-script output verified as already matching
the panel's expected shapes. Post entries now require exactly two segments
(`tech/a/b` is skipped, not silently busted as `tech/a`).

Still open: Phase 0/1 — WHY the correctly-formatted individual bust failed
while `post-pages` worked (both tags sit on the same entry). Unreproduced;
matters less now that misses self-heal, but worth a repro pass before trusting
targeted busts again. Also open: Phase 3 prod validation after deploy.

Written 2026-07-17.

## Incident summary

A published post (datetime 4 days past, clean ASCII slug, correct section) returned
404 on its detail page while appearing on the section list, on prod. A correctly
formatted `section/slug` bust through the admin RevalidatePanel ran (success log
line confirmed, entry format confirmed) but did **not** clear the 404. The
"All posts" bust (`post-pages` tag) cleared it immediately.

Established facts:

- Detail lookup: `getPostBySlug` (`src/lib/db/posts.ts:162`) — `findFirst({ section, slug, published: true })`
  inside `unstable_cache`, keyParts `[post-{section}-{slug}]`, tags
  `[post-{section}-{slug}, post-pages]`, **no TTL**. A miss caches `null` durably.
- List page 1 applies the identical datetime gate (`posts.ts:131`), so the post
  passing the list proves section/published/datetime — the detail 404 was the
  cached `null`, not a query condition.
- Import scripts write via direct Prisma and cannot bust tags (documented at
  `src/app/api/admin/revalidate/route.ts:11`); the panel exists to compensate.
- Tag archaeology: per-post tag format `post-{section}-{slug}` unchanged since
  a9dd2e2 (2026-04-09). Companion tag changed in 7c5d19a (2026-07-07):
  `blog-{section}` → `post-pages`. Import happened ~2026-07-13.
- Both tags sit on the same entry, yet busting one worked and the other didn't.
  That asymmetry is the open question.

## Phase 0 — Gather facts (read-only, no code)

1. Prod deployment: which commit was live (a) when the poisoned entry was
   plausibly written, (b) when the failed individual bust ran. Vercel dashboard.
2. Vercel logs: capture the exact `posts: [...]` array from the failed bust's
   `[api:admin:revalidate] success` line (already sighted — record it verbatim).
3. Pin down `next` version from package.json, then read that version's actual
   semantics (changelog + source, not memory) for:
   - what composes the `unstable_cache` data-cache key (does the callback
     source participate → do refactors orphan entries?),
   - whether tags are attached to entries at **write time** (old entries keep
     old tag sets across deploys on Vercel's data cache),
   - `revalidateTag(tag, "max")` profile-arg behavior vs single-arg.
4. Hypotheses to rank with those facts:
   - H1 write-time tags: entry written under a pre-7c5d19a build carried
     `[post-{s}-{slug}, blog-{section}]`… note: this alone does NOT explain it,
     since the per-post tag existed in both eras. Only viable if the *key* also
     survived while tags predate a9dd2e2, or some subtler tag-store shape.
   - H2 propagation timing: individual bust worked but the refetch raced the
     global invalidation; "All posts" got the credit. Weak (user refetched more
     than once) but cheap to test in Phase 1.
   - H3 genuine Next bug: per-entry multi-tag invalidation misses one tag path.
     Only claimable after H1/H2 die and a minimal repro exists.

## Phase 1 — Reproduce (decides code bug vs platform behavior)

1. Local, prod mode (`yarn build` + start): request a nonexistent slug (poison
   the null), insert the row via the import script, bust the individual tag via
   the panel/API, refetch. Repeat with a delay to test H2.
2. Reproduces locally → our layer or Next; reduce to a minimal
   `unstable_cache` + `revalidateTag` case and bisect.
3. Doesn't reproduce → Vercel data-cache layer; rerun the same scenario on a
   preview deployment and compare.

## Phase 2 — Fixes (worth shipping regardless of diagnosis)

1. **Stop durably caching misses** — the enabler of the whole incident class.
   Recommended: throw a sentinel inside the cached callback on miss, catch in
   `getPostBySlug`, return null — `unstable_cache` does not store thrown
   results, so a miss is never cached and self-heals on the next request.
   Cost: every 404 probe hits the DB (fine at blog scale; wrapper map already
   bounded). Alternative if that's unpalatable: separate short-TTL wrapper for
   misses (`revalidate: 60`) so poison self-heals in ≤1 min.
   Apply the same treatment to the projects detail path (`src/lib/db/projects.ts`),
   which has the identical shape.
2. **Honest revalidate endpoint**: `route.ts` currently silently skips
   malformed/unknown-section entries and returns `ok: true` (route.ts:46) —
   violates no-silent-suppression and blinded this debugging session. Return
   `{ applied: [...], skipped: [...] }`; RevalidatePanel surfaces skipped
   entries as a warning. (Option agreed in chat 2026-07-17.)
3. **Single source for tag strings**: `postDetailTag(section, slug)` +
   `POST_PAGES_TAG` used by the wrapper, `revalidatePost`, and tests, so the
   wrapper and the buster can never drift. Same for projects.
4. **Import-script output check**: confirm the slugs the import scripts print
   are in exactly the `section/slug` shape the panel expects.

## Phase 3 — Tests + verification

- Tests: miss-not-cached (or short-TTL) behavior; endpoint applied/skipped
  contract incl. malformed entries; panel warning rendering; tag-helper
  consistency (wrapper tags === buster tags).
- Local repro from Phase 1 now clears with an individual bust.
- Prod validation after deploy: poison a throwaway slug, individual bust, 404
  clears without "All posts".

## Side notes for the session

- `.claude/CLAUDE.md` project-structure section still lists `src/lib/posts.ts`,
  `src/lib/schemas.ts`, etc. — the lib layer now lives under `src/lib/db/`,
  `src/lib/api/`, `src/lib/utils/`. Doc drift, worth a one-line fix.
- The incident's live symptom is already resolved ("All posts" bust); nothing
  is user-facing broken right now.
