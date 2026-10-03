# roland.leth.ro

Personal website for Roland Leth: landing page, blog, and projects portfolio.

## Sanctioned command shapes

Log paths: Use your scratchpad to store and read logs, if you need.

- **Test**: `yarn test [run] [args]`
- **Lint**: `yarn lint [args]`
- **Type-check**: `yarn [run] tsc --noEmit [args]`
- **Build**: `yarn [run] build [args]`

## Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: PostgreSQL via Prisma (Prisma Postgres)
- **Auth**: Custom JWT via `jose` + `bcryptjs` (single-user, session cookie)
- **Images and video**: Vercel Blob (Hobby: 1 GB storage and 10 GB data transfer a month; past either, Blob stops serving for up to 30 days, images included)
- **Deployment**: Vercel
- **Linting**: ESLint 9 (flat config) + Prettier
- **Markdown**: `unified` (`remark-parse` + `remark-gfm` + `remark-rehype`), rendered to React via `hast-util-to-jsx-runtime`. Highlighting is `rehype-pretty-code` (Shiki) on pages; the feed swaps it for `rehype-stringify` so the markup carries no stylesheet-dependent spans. All processors are built once at module load in `src/lib/content/markdown.ts`.
- **Analytics**: Vercel Analytics (cookie-free, no banner needed)

## Project structure

```
src/
  app/
    page.tsx                    # Landing page (/)
    sitemap.ts, robots.ts       # Sitemap and robots.txt
    blog/
      [section]/
        (list)/                 # Blog list, page 1 (/blog/tech); the group scopes its loading.tsx to this page
        p/[page]/               # Blog list, page 2 onward (/blog/tech/p/2)
        [slug]/                 # Single post (/blog/tech/my-post)
          override-preview/     # Public preview of a scheduled post's body
        archive/                # Archive per section (/blog/tech/archive)
        search/                 # Search per section (/blog/tech/search)
    guides/                     # Guides index (/guides)
      [slug]/                   # A guide or a topic hub, one flat namespace (/guides/my-guide)
    projects/
      (gallery)/                # Projects gallery (/projects); the group scopes its loading.tsx to this page
      [slug]/                   # Single project (/projects/my-app)
    tools/
      loan-calculator/          # Loan calculator tool (/tools/loan-calculator)
    about/                      # About page (/about)
    privacy/, terms/            # Legal pages, per app
    llms.txt/, indexnow-key.txt/  # Plain-text routes; the folder name is the URL
    admin/
      login/                    # Login page
      (protected)/              # Dashboard and the post/project/guide/topic editors
    api/
      admin/                    # Session-gated writes: CRUD, upload, revalidate, keepalive, IndexNow
      auth/                     # Login, logout
      cron/                     # Vercel Cron: keepalive ping, scheduled-content revalidation
      feed/[section]/           # Atom feed, served at /blog/:section/feed.xml
      blog/, guides/            # Raw-markdown views, served at the *.md URLs
  proxy.ts                      # Middleware: admin auth gate only (matcher is /admin* + /api/admin*)
  components/                   # Grouped by feature: about/, admin/, blog/, guides/, home/, loan-calculator/, privacy/, projects/
    ui/                         # Generic primitives and hooks reused across features
    Header.tsx, Footer.tsx, ...  # Top-level shared chrome
  lib/
    api/                        # Route helpers: auth guards, error responses, audit log, Zod schemas (schemas.ts)
    auth/                       # JWT session (auth.ts), admin page guards, typed env accessors (env.ts)
    client/                     # Browser-side helpers and hooks: Framer Motion variants (motion.ts), theme, nav links
    content/                    # Rendering: markdown.ts, page metadata, JSON-LD, feed identity, .md exports, IndexNow
    db/                         # Prisma client (db.ts), cached queries and tag busts (posts.ts, projects.ts, guides.ts), sections.ts
    import/                     # Pure cores for the scripts/ importers and the admin bulk upload
    routing/legacyRoutes.ts     # Legacy redirect + rewrite rules, consumed by next.config.ts
    utils/                      # Pure functions (format.ts, pagination.ts, platforms.ts); reaches the client bundle
  generated/prisma/             # Generated Prisma client output
  test/                         # Vitest setup files
scripts/                        # tsx scripts behind the db:*, blob:* and og:card commands
prisma/
  schema.prisma                 # Database schema
public/
  images/                       # Static images (project icons, screenshots, etc.)
```

## Key conventions

- App Router with server components by default; `"use client"` only where needed.
- All data fetching in server components or API routes via Prisma.
- Tailwind for all styling; no CSS-in-JS.
- Blog posts stored in PostgreSQL (markdown body, rendered on read).
- Projects stored in PostgreSQL (like posts), managed via admin UI.
- Blog URLs: `/blog/:section/:slug` (e.g., `/blog/tech/my-post`).
- Blog pagination is path-based: `/blog/:section` is page 1, `/blog/:section/p/:page` is page 2 onward. Always build these with `blogPagePath` rather than by hand. Do NOT read `searchParams` in a list route — that alone makes it render per request.
- Legacy URLs redirect via `next.config.ts`, not middleware — see "Legacy URL handling" below.
- Uses `yarn`.

## Environment variables

```
DATABASE_URL=           # PostgreSQL connection string
SESSION_SECRET=         # JWT signing secret; 32+ chars, `openssl rand -hex 32`
ADMIN_EMAIL=            # Single admin user email
ADMIN_HASH_PASSWORD=    # bcrypt hash of admin password (hex-encoded)
CRON_SECRET=            # Bearer token for /api/cron/*; Vercel Cron sends it automatically once set. Unset means every cron run 401s and scheduled content never surfaces on its own — see "Scheduled content and revalidation" below.
INDEXNOW_KEY=           # Optional. IndexNow verification key, 8-128 chars of [a-zA-Z0-9-]
KV_REST_API_URL=        # Optional. Upstash Redis REST URL. Pairs with the token below.
KV_REST_API_TOKEN=      # Optional. Upstash Redis REST token. Either one missing and `getRedisConfig()` returns null: the login limiter falls open and cron skips its keepalive ping.
IP_HASH_SECRET=         # Optional. HMAC key that pseudonymizes client IPs into rate-limit bucket keys. `openssl rand -hex 32`
BLOB_READ_WRITE_TOKEN=  # Vercel Blob token. The admin uploads and the import scripts need it; Vercel adds it when the store is connected to the project.
ALLOW_UPLOADS=          # Must be exactly `true` for the admin uploads (image and video) to work. Anything else and both routes answer 403 "Uploads are disabled". The import scripts ignore it.
```

`INDEXNOW_KEY` is served verbatim at `/indexnow-key.txt` and sent as the `key`
in submissions from the admin dashboard's IndexNow panel. Generate with
`openssl rand -hex 32`. Unset is fine — the key route 404s and the submit route
returns 503 — but set it and confirm `/indexnow-key.txt` is live **before** the
first submit: IndexNow fetches `keyLocation` at submit time and 403s if it isn't
serving the matching key.

`IP_HASH_SECRET` controls rate-limit *granularity*, not whether the limiter
runs. With it, each client IP gets its own 5-per-15-minutes budget. Without it
but with Redis configured, every request shares one global bucket — still a cap,
but a botnet can exhaust it and lock the admin out, so the route warns at
startup when it sees that combination. Plain-IP keys are not an option: the IPv4
keyspace is small enough to brute-force a plain hash.

The secret does not rotate, and rotating it on Vercel is not worth the cost —
see `dev-journal/2026-05-14.md`. That makes the stored bucket key pseudonymous,
not anonymous.

## Commands

```bash
yarn run dev                # Start dev server
yarn run build              # Production build
yarn run start              # Serve the production build
yarn run lint               # ESLint, with Prettier running as a lint rule
yarn test                   # Vitest in watch mode; `yarn test run` for a single pass
yarn tsc --noEmit           # Type-check, scripts/ included
yarn run db:push            # Push schema.prisma to the database (see below)

yarn run db:import-posts <folder> [--dry-run] [--overwrite] [--verbose] [--section=tech|life]
yarn run db:import-guides <folder> [--dry-run] [--overwrite]
yarn run db:import-projects [name…] [--dry-run] [--cleanup] [--reupload] [--no-prune]
yarn tsx scripts/init-post-slugs.ts <folder> [--dry-run] [--section=tech|life]   # Stamp post files with their DB slugs
yarn run blob:prune-uploads [--apply]   # Delete admin uploads nothing references; dry run without --apply
yarn run og:card [--check]  # Render public/images/og-card.png; --check exits 1 on drift, writes nothing
```

The import, resync and prune scripts load `.env` through `dotenv/config`, never
`.env.local`, and act on whatever `DATABASE_URL` and `BLOB_READ_WRITE_TOKEN` it
holds. Production credentials go there: `vercel env pull .env
--environment=production` (it asks before overwriting). A bare `vercel env pull`
writes the Development values to `.env.local`, which no script reads. A variable
marked Sensitive on Vercel can't be read back, so the pull can't fill it; copy
that one in by hand. Next.js loads `.env.local` over `.env`, so keep a development
`DATABASE_URL` in `.env.local`, or `yarn dev` runs against production.

`db:import-posts` uploads the local media a post file references; see "Media in
post bodies" below. It needs `BLOB_READ_WRITE_TOKEN` only when a post it could
write has local media, and it lists the store once per run.

A project manifest with `"isDraft": true` is skipped by `db:import-projects`,
named or not, and counted as skipped rather than failed, so an app can be staged
before it's ready without every bare run failing on it. Remove the key to import.

Dry run first; `blob:prune-uploads` deletes permanently. It prints the database
and blob store it targets before anything else, and `--apply` refuses when the
uploads it would delete outnumber the ones the database references.

There are no migrations. Schema changes go through `db:push`, and there is no
`prisma/migrations` folder. `db:push` can't tell a rename from a drop plus an add,
so it would drop a renamed column's data: rename by hand with `ALTER TABLE … RENAME
COLUMN` before deploying the schema change.

A change that has to carry data from a dropped column into new ones needs
hand-written SQL that adds the new columns and fills them from the old one. Run
it once against each database, before the `db:push` that drops the old column:
the push only adds and drops, and it would drop the data with the column. The
SQL is a one-off and isn't kept in the repo.

## Database schema (posts)

The blog has two sections (`tech` and `life`), stored in a single `posts` table with a `section` field.

Post fields: title, body (markdown), description (the meta description, OG description, feed `<summary>` and JSON-LD description — read from the file's `description:` frontmatter on import or the admin form, derived from the body when neither sets it (the title, for a body with no prose); every write path resolves it through `src/lib/content/postDescription.ts`; nothing on the site renders it, the list card previews the body), imageUrl, section, slug (authored, never derived: the admin form's Slug field, which fills from the title until edited, or the file's required `slug:` frontmatter on import and bulk upload — a file without one is skipped. Frozen after creation: the update schema has no slug, so a title edit never moves the URL. Project slugs follow the same rule), datetime (original format: `yyyy-MM-dd-HHmm`), readingTime, published (boolean for draft support).

## Media in post bodies

A body embeds an image or a video with image syntax, `![alt](url)`. A URL whose
path ends in `.mp4` or `.webm` renders as a `<video>` with controls; any other
stays an `<img>`. The rewrite is `src/lib/content/rehypeVideo.ts`, shared by the
page and feed processors. Raw HTML is still dropped, a typed `<video>` tag
included. The alt text becomes the video's `aria-label`. A `.mov` is not
accepted anywhere: playback outside Safari depends on the browser and the codec.

A file gets its URL one of three ways:

- **Import script.** A path with no scheme and no leading `/` names a file
  relative to the import folder: `![Demo](media/my-post/demo.mp4)`.
  `db:import-posts` uploads it to Blob under `posts/<section>/<slug>/`, keyed by
  its content, and stores the body with the Blob URL. The file keeps the relative
  path, so an editor's preview still finds it. Only posts the run writes upload
  anything, a re-run reuses what is stored, and after the write the blobs a post
  no longer names are deleted. A post with a missing or unsupported media file
  is skipped whole, as is a path with `..` in it. The admin bulk upload gets only
  the `.md` file, so it skips a post that references local media.
- **Admin.** The post form's "Upload video" button sends the file from the
  browser straight to Blob and inserts `![](url)` at the cursor. It can't go
  through a route: Vercel caps a function's request body at 4.5 MB, which also
  caps the admin image upload below its own 10 MiB limit. The route
  (`/api/admin/upload/video`) only signs the upload, so it never sees the bytes;
  the type check runs in the browser before anything is sent.
- **`public/`.** `/images/…` and `/videos/…` paths are served from the repo and
  pass through every path untouched.

A video is capped at 20 MiB (`MAX_VIDEO_UPLOAD_MIB`), in the admin and in the
script. The cap protects the 10 GB monthly Blob transfer allowance: every play
downloads the file. The CSP allows media from `'self'` and the Blob host
(`media-src`), and the browser upload to `https://vercel.com/api/blob/`
(`connect-src`).

Deleting a post or a project in the admin also deletes the media the import
scripts uploaded for it: everything under `posts/<section>/<slug>/` or
`projects/<slug>/` (`src/lib/api/mediaCleanup.ts`). A post whose section was
changed after its import has its media under the old section, where only the
blobs its body names are deleted, because that prefix can belong to another
post with the same slug. The cleanup runs after the row is gone and never fails
the delete; a failure is a warning in the route's log. Files uploaded through
the admin have UUID keys at the store root and are left to
`blob:prune-uploads`.

## Legacy URL handling

All rules live in `src/lib/routing/legacyRoutes.ts` and are wired into `next.config.ts` via `redirects()` and `rewrites()`. Vercel compiles both into its routing layer, so they resolve **without a function invocation** — and `redirects()` runs ahead of middleware, so a legacy hit never reaches one. Keep them there; moving any of this back into `src/proxy.ts` puts it back on billed compute.

Redirects (308, query string preserved automatically):

- `/tech/blog/:slug` → `/blog/tech/:slug` (and `/life`)
- `/tech/archive`, `/tech/search`, `/tech` → the `/blog/tech/*` equivalents
- `/tech/feed`, `/feed`, `/rss`, `/rss.xml`, `/feed.xml`, `/atom.xml`, `/index.xml` → `/api/feed/:section`, defaulting to `tech`
- `/privacy-policy` → `/privacy`

Rewrites (`beforeFiles`, so they win over the filesystem route that would otherwise capture the URL):

- `/blog/:section/feed.xml` → `/api/feed/:section`
- `/blog/:section/:slug.md` → `/api/blog/:section/:slug/md`

Root-level legacy slugs (`/:slug` → the canonical post/project URL) were **removed** — the route invoked a function on every unmatched path, including scanner probes, and carried no measurable traffic. Unmatched paths now resolve to the static 404 at zero compute.

## Scheduled content and revalidation

A post (`datetime`) or guide (`publishedAt`) with a future date is written to the
database but held out of every public surface by a filter that runs outside the
data cache, when a page renders.

Every public content route is static, so that render happens when the page is
generated, and the result then freezes: nothing runs the filter again when the
date passes. `/api/cron/revalidate-scheduled` runs daily, counts posts and guides
that came due in a 50h lookback window, and busts the tags only when one did.

Daily is the ceiling on Hobby: those accounts reject any cron expression that
would fire more than once a day, and `0 * * * *` or `0 */3 * * *` fails at deploy
time. A sub-daily cadence is still reachable — Hobby allows 100 cron entries per
project, so N entries at fixed hours (`0 0 * * *`, `0 3 * * *`, …) buy back an
every-N-hours schedule. Doing that means narrowing `WINDOW_HOURS` to match.

The cost of daily is latency: a post dated 09:00 stays invisible until the
midnight run, so up to ~25h. To surface one sooner, bust the tags by hand —
see below.

A dynamic route would not need this — a per-request filter re-evaluates on its
own. The blog list used to work that way, caching a padded superset and
filtering at read time. That mechanism was removed when the list was prerendered,
because a static page has no read time for the filter to run in.

The cron replaced a `revalidate = 3600` on all three routes. That regenerated
each of them every hour whether or not anything had changed — and with crawlers
and feed readers polling continuously, it always did. Don't reintroduce it; the
tests on the feed and sitemap assert its absence.

The lookback window is deliberately wider than the cron interval. Overlap costs
one redundant revalidation; a gap strands content until the next real mutation.
It is 50h rather than 24h because three effects stack: Hobby cron timing is only
accurate to ±59 minutes, so consecutive runs can land 24h59m apart with nothing
wrong; Vercel documents cron delivery as best effort with no retry, so a run can
simply not happen; and the post half of the window flattens to a local
wall-clock string, so a spring-forward transition costs it one more hour on a
self-hosted deploy in a DST zone (inert on Vercel itself, which runs UTC).
Double the interval for a missed run, add an hour for the jitter, add an hour
for the DST shift. Change the schedule in `vercel.json` and `WINDOW_HOURS` must
follow.

## Forcing scheduled content live

The cron publishes nothing. Its only effect is tag busts: `revalidatePostSection()`
per section plus `revalidateGuides()`, then each due item's own detail tag, and
for a due guide its topic hub's tag (`revalidateGuideTopicHubs`). The `datetime <= now`
filter runs when the page regenerates, so **anything that forces those routes to
regenerate has the same effect as the cron run**. Three ways, narrowest first:

1. `GET /api/cron/revalidate-scheduled` with `Authorization: Bearer $CRON_SECRET`
   — the same code path, same tags, and it logs the same lines.
2. The dashboard's Revalidate panel, with the due post as `section/slug` or the
   due guide's slug. A post gets its detail page, `feed-{section}`,
   `blog-{section}` and `posts` busted; a guide gets its detail page, its topic
   hub and `guides`. Saving the due post or guide itself in the admin does the
   same. Saving a *different* post does not: `revalidatePost` busts only the
   saved post's own detail tag, so the due post's page keeps the 404 it pinned
   while it was future-dated, even where the regenerated lists now link to it.
3. Purge the cache or redeploy from the Vercel dashboard. Works, but drops every
   unrelated cached page too, so the whole site cold-renders on next hit.

None of them publishes early. Before a post's `datetime` passes, the filter still
excludes it, and the regeneration is wasted work. Forcing is "publish it now",
never "publish it ahead of schedule".

## Design direction

- Clean, modern, minimal
- Dark/light mode support
- Smooth transitions and subtle animations (Framer Motion)
- Responsive (mobile-first)
- Good typography (Inter or similar modern sans-serif)

## Testing

- When writing tests, don't separate sections with big comment blocks. If you want to use something, use `regions`.
