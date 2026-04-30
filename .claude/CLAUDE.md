# roland.leth.ro

Personal website for Roland Leth: landing page, blog, and projects portfolio.

## Sanctioned command shapes
Skip the permission prompt; anything else prompts. Full grammar in `.claude/hooks/auto-allow.jq`.
Log paths: `/tmp/rlr-test.log`, `/tmp/rlr-tsc.log`, `/tmp/rlr-lint.log`.

- **Test**: `yarn test [run] [args]`
- **Lint**: `yarn lint [args]`
- **Type-check**: `yarn [run] tsc --noEmit [args]`
  Optional tail on any of the above: ` > <log-path> 2>&1; echo "exit=$?"`
- **Search logs**: `rg [flags] <pattern> <log-path>+ [flags]` — short-flag bundles only (e.g. `-iN`, `-A 3`).
- **Read logs (CLI)**: `head|tail [-n] N <log-path>+`.
- **Read logs (tool)**: `Read` on a log path is auto-allowed.
- **Pipe chain** (append to any CLI command above): `| head|tail [-n] N`, `| wc [-lwcm]`, `| sort [-urnhdiVfb]`, `| rg [flags] <pattern>`.
- **Chain commands**: `&&` or `;`.
- **Args**: plain tokens only — `[A-Za-z0-9_./:=@,+%-]`. No quotes, spaces inside values, or shell metas (so `-t pattern` works, `-t "pat with space"` doesn't).

## Stack

- **Framework**: Next.js 15 (App Router)
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
    [slug]/                     # Catch-all for legacy root-level URLs (DB lookup → permanentRedirect or notFound)
  proxy.ts                      # Middleware: auth protection + legacy URL redirects
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
- Legacy URLs redirect via middleware: pattern-based for `/tech/blog/*` and `/life/blog/*`; database lookup for root-level `/:slug`.
- Uses `yarn`.

## Environment variables

```
DATABASE_URL=           # PostgreSQL connection string
SESSION_SECRET=         # JWT signing secret (any string)
ADMIN_EMAIL=            # Single admin user email
ADMIN_HASH_PASSWORD=    # bcrypt hash of admin password (hex-encoded)
```

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

Pattern-based redirects live in `src/proxy.ts` (Next.js middleware); single-segment root-level slug lookups live in `src/app/[slug]/page.tsx` (catch-all page, reached only when no static top-level route matches):

- `/tech/blog/:slug` → 301 to `/blog/tech/:slug` (middleware, pattern match)
- `/life/blog/:slug` → 301 to `/blog/life/:slug` (middleware, pattern match)
- `/tech/archive` → 301 to `/blog/tech/archive` (middleware, pattern match)
- `/:slug` (catch-all) → DB lookup via `lookupLegacySlug`, `permanentRedirect` (308) to `/blog/{section}/{slug}` or `/projects/{slug}` on hit, `notFound()` (renders `app/not-found.tsx`) on miss

## Design direction

- Clean, modern, minimal
- Dark/light mode support
- Smooth transitions and subtle animations (Framer Motion)
- Responsive (mobile-first)
- Good typography (Inter or similar modern sans-serif)

## Testing

- When writing tests, don't separate sections with big comment blocks. If you want to use something, use `regions`.
