# roland.leth.ro

Personal website for Roland Leth: landing page, blog, and projects portfolio.

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
    api/                        # API routes (posts CRUD, feed, legacy-redirect, upload)
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
SESSION_SECRET=         # JWT signing secret (hex-encoded)
ADMIN_EMAIL=            # Single admin user email
ADMIN_PASSWORD_HASH=    # bcrypt hash of admin password (hex-encoded)
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

Handled in `src/proxy.ts` (Next.js middleware), no hardcoded slug lists:

- `/tech/blog/:slug` → 301 to `/blog/tech/:slug` (pattern match)
- `/life/blog/:slug` → 301 to `/blog/life/:slug` (pattern match)
- `/tech/archive` → 301 to `/blog/tech/archive` (pattern match)
- `/:slug` (root-level, single segment, not a known route) → database lookup by slug, 301 to `/blog/{section}/{slug}` if found, otherwise 404

## Design direction

- Clean, modern, minimal
- Dark/light mode support
- Smooth transitions and subtle animations (Framer Motion)
- Responsive (mobile-first)
- Good typography (Inter or similar modern sans-serif)

## Testing

- When writing tests, don't separate sections with big comment blocks. If you want to use something, use `regions`.

## Rules

- ALWAYS use dedicated/builtin tools (Read, Glob, Grep, LSP, IDE tools) over Bash for any operation (eg `Read` for reading files, `Glob` for pattern matching, `Grep` for searching, `LSP` for language server features, `IDE tools` for project-specific tasks); use Bash only when no dedicated/builtin tool covers it, and confirm with me first; non-negotiable.
- If you find yourself writing a Bash command, stop and ask if there's a dedicated/builtin tool for the job. If there is, use it; if not, confirm with me before proceeding with Bash.
- When delegating work to a subagent via Task/Agent tool, always include the above instructions in the prompt, and explicitly state that they should be followed.
