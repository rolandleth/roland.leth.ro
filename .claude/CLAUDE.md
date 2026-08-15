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
- **Database**: PostgreSQL via Prisma ORM (Vercel Postgres / Neon)
- **Auth**: Custom JWT via `jose` + `bcryptjs` (single-user, session cookie)
- **Images**: Vercel Blob (free tier: 1GB storage)
- **Deployment**: Vercel
- **Linting**: ESLint 9 (flat config) + Prettier
- **Markdown**: `react-markdown` + `remark-gfm` + `rehype-highlight`
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
- Legacy URLs redirect via `next.config.ts`, not middleware — see "Legacy URL handling" below.
- Uses `yarn`.

## Environment variables

```
DATABASE_URL=           # PostgreSQL connection string
SESSION_SECRET=         # JWT signing secret; 32+ chars, `openssl rand -hex 32`
ADMIN_EMAIL=            # Single admin user email
ADMIN_HASH_PASSWORD=    # bcrypt hash of admin password (hex-encoded)
INDEXNOW_KEY=           # Optional. IndexNow verification key, 8-128 chars of [a-zA-Z0-9-]
```

`INDEXNOW_KEY` is served verbatim at `/indexnow-key.txt` and sent as the `key`
in submissions from the admin dashboard's IndexNow panel. Generate with
`openssl rand -hex 32`. Unset is fine — the key route 404s and the submit route
returns 503 — but set it and confirm `/indexnow-key.txt` is live **before** the
first submit: IndexNow fetches `keyLocation` at submit time and 403s if it isn't
serving the matching key.

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

## Design direction

- Clean, modern, minimal
- Dark/light mode support
- Smooth transitions and subtle animations (Framer Motion)
- Responsive (mobile-first)
- Good typography (Inter or similar modern sans-serif)

## Testing

- When writing tests, don't separate sections with big comment blocks. If you want to use something, use `regions`.
