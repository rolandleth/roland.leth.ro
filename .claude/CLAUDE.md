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
- **Images**: Vercel Blob (free tier: 1GB storage)
- **Deployment**: Vercel
- **Linting**: ESLint 9 (flat config) + Prettier
- **Markdown**: `unified` (`remark-parse` + `remark-gfm` + `remark-rehype`), rendered to React via `hast-util-to-jsx-runtime`. Highlighting is `rehype-pretty-code` (Shiki) on pages; the feed swaps it for `rehype-stringify` so the markup carries no stylesheet-dependent spans. All processors are built once at module load in `src/lib/content/markdown.ts`.
- **Analytics**: Vercel Analytics (cookie-free, no banner needed)

## Project structure

```
src/
  app/
    page.tsx                    # Landing page (/)
    blog/
      [section]/                # Blog list (/blog/tech, /blog/life)
        [slug]/                 # Single post (/blog/tech/my-post)
        archive/                # Archive per section (/blog/tech/archive)
        search/                 # Search per section (/blog/tech/search)
    projects/                   # Projects portfolio (/projects, /projects/[slug])
    tools/
      loan-calculator/          # Loan calculator tool (/tools/loan-calculator)
    about/                      # About page (/about)
    admin/                      # Post/project creation/editing (protected)
    api/                        # API routes (posts CRUD, feed, upload)
  proxy.ts                      # Middleware: admin auth gate only (matcher is /admin* + /api/admin*)
  components/                   # Shared UI components
    blog/                       # Blog-specific components
    projects/                   # Project-specific components
    admin/                      # Admin-specific components
    loan-calculator/            # Loan calculator components
    Header.tsx, Footer.tsx, ...  # Top-level shared components
  lib/                          # Utilities, database client, helpers
    db.ts                       # Prisma client
    auth.ts                     # JWT session helpers
    posts.ts                    # Post query helpers
    projects.ts                 # Project query helpers
    sections.ts                 # Blog section helpers
    routing/legacyRoutes.ts     # Legacy redirect + rewrite rules, consumed by next.config.ts
    markdown.ts                 # Markdown processing
    schemas.ts                  # Zod validation schemas
    format.ts                   # Formatting utilities
    motion.ts                   # Framer Motion variants
  generated/prisma/             # Generated Prisma client output
  test/                         # Vitest setup files
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
yarn run dev             # Start dev server
yarn run build           # Production build
yarn run lint            # ESLint + Prettier check
yarn run db:push         # Push Prisma schema to database
yarn run db:migrate      # Run Prisma migrations
yarn run db:seed         # Seed database (if needed)
```

## Database schema (posts)

The blog has two sections (`tech` and `life`), stored in a single `posts` table with a `section` field.

Post fields: title, body (markdown), summary, imageUrl, section, slug (derived from title), datetime (original format: `yyyy-MM-dd-HHmm`), readingTime, published (boolean for draft support).

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

Root-level legacy slugs (`/:slug` → the canonical post/project URL) were **removed** — the route invoked a function on every unmatched path, including scanner probes, and carried no measurable traffic. Unmatched paths now resolve to the static 404 at zero compute. `LEGACY_POST_SLUG_ALIASES` still exists and is unrelated: `src/app/blog/[section]/[slug]/page.tsx` uses it to fix the old slugifier's dirty slugs on a blog-route miss.

## Scheduled content and revalidation

A post (`datetime`) or guide (`publishedAt`) with a future date is written to the
database but held out of every public surface by a **read-time** filter. Two
different mechanisms surface it, and which one applies depends on whether the
route renders per request:

Every public content route is now static, so they all take the same path: the
`datetime <= now` / `publishedAt` filter runs when the page is generated and then
freezes. `/api/cron/revalidate-scheduled` runs daily, counts posts and guides
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

The cron publishes nothing. Its only effect is `revalidatePostSection()` per
section plus `revalidateGuides()` — three tags and one tag. The `datetime <= now`
filter runs when the page regenerates, so **anything that forces those routes to
regenerate has the same effect as the cron run**. Three ways, narrowest first:

1. `GET /api/cron/revalidate-scheduled` with `Authorization: Bearer $CRON_SECRET`
   — the same code path, same tags, and it logs the same lines.
2. Save any post in the admin. `revalidatePost` busts `feed-{section}`,
   `blog-{section}`, and `posts`. Covers posts only: `guides` is a separate tag,
   so a scheduled **guide** needs a guide mutation or option 1.
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
