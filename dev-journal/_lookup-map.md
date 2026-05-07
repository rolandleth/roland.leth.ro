# Lookup Map — index (through commit c945b8a on 2026-05-07)

_Symbols extracted via regex (no LSP); signatures may be truncated to first line._

## src/

- `async function proxy(request: NextRequest): Promise<NextResponse>` — Next.js middleware: admin auth gate + legacy URL redirects. `/api/admin` and `/api/upload` are gated; `/tech/blog/*`, `/life/blog/*`, `(/tech|/life)?/feed`, `/privacy-policy` redirected. [src/proxy.ts]
- `const config` — Next.js middleware matcher; runs on every path except `_next/static`, `_next/image`, common static-asset extensions. [src/proxy.ts]

## src/app/

- `async function generateMetadata(): Promise<Metadata>` — root metadata; `metadataBase` from `siteBase()`, title template `"%s | Roland Leth"`. [src/app/layout.tsx]
- `default function RootLayout({ children })` — html/body shell; reads `theme` cookie server-side via `resolveInitialThemeClass` to avoid theme-flash on load. [src/app/layout.tsx]
- `default function ClientAnalytics()` — single client island wrapping both Vercel `Analytics` and `SpeedInsights`; `beforeSend={filterAdminEvents}` drops `/admin/*` pings. [src/app/ClientAnalytics.tsx]
- `default function NotFound()` [src/app/not-found.tsx]
- `const metadata` — `not-found` page metadata. [src/app/not-found.tsx]
- `const metadata` — root landing page metadata. [src/app/page.tsx]
- `default function Home()` — landing page. [src/app/page.tsx]
- `default async function sitemap(): Promise<MetadataRoute.Sitemap>` — note: filters only `published: true`, NOT `datetime <= now` — future-dated drafts get listed (open thread). [src/app/sitemap.ts]
- `const viewport` [src/app/layout.tsx]

## src/app/[slug]/

- `default async function LegacySlugPage({ params })` — root-level catch-all for legacy URLs; runs only when no static top-level route matches. `permanentRedirect(308)` on hit, `notFound()` on miss; DB outage collapses to `notFound()` with tagged log. [src/app/[slug]/page.tsx]

## src/app/about/

- `const metadata` [src/app/about/page.tsx]
- `default function AboutPage()` [src/app/about/page.tsx]
- `default function AboutContent()` [src/app/about/AboutContent.tsx]

## src/app/admin/(protected)/

- `default async function ProtectedLayout({ children })` — layout-level `verifySession()` + redirect; defense-in-depth only (middleware is the real gate; `generateMetadata` of children runs outside this guard). [src/app/admin/(protected)/layout.tsx]
- `default async function AdminDashboard({ searchParams })` — tab-router for posts/projects; reads `?tab=`/`?q=`/`?page=` and renders `PostsTab` or `ProjectsTab`. [src/app/admin/(protected)/page.tsx]

## src/app/admin/(protected)/posts/[id]/edit/

- `async function generateMetadata({ params })` — single DB hit shared with the page body via React `cache()` inside `loadPostForAdmin`. [src/app/admin/(protected)/posts/[id]/edit/page.tsx]
- `default async function EditPostPage({ params })` [src/app/admin/(protected)/posts/[id]/edit/page.tsx]

## src/app/admin/(protected)/posts/new/

- `const metadata` [src/app/admin/(protected)/posts/new/page.tsx]
- `default function NewPostPage()` [src/app/admin/(protected)/posts/new/page.tsx]

## src/app/admin/(protected)/projects/[id]/edit/

- `async function generateMetadata({ params })` — same `React.cache()` dedupe pattern as posts edit. [src/app/admin/(protected)/projects/[id]/edit/page.tsx]
- `default async function EditProjectPage({ params })` [src/app/admin/(protected)/projects/[id]/edit/page.tsx]

## src/app/admin/(protected)/projects/new/

- `const metadata` [src/app/admin/(protected)/projects/new/page.tsx]
- `default function NewProjectPage()` [src/app/admin/(protected)/projects/new/page.tsx]

## src/app/admin/login/

- `const metadata` [src/app/admin/login/page.tsx]
- `default async function LoginPage()` — redirects authenticated visitors to `/admin`; renders `LoginForm` otherwise. [src/app/admin/login/page.tsx]

## src/app/api/admin/posts/

- `async function POST(request: Request): Promise<NextResponse>` — create a post; goes through `parseJsonBody`; 409 on slug conflict via `isPrismaUniqueConstraint`. [src/app/api/admin/posts/route.ts]

## src/app/api/admin/posts/[id]/

- `async function DELETE(...)` — soft 404 path uses tagged `handlePrismaError`. [src/app/api/admin/posts/[id]/route.ts]
- `async function GET(...)` [src/app/api/admin/posts/[id]/route.ts]
- `async function PUT(...)` — reads previous `section` before `update`; on cross-section move, busts BOTH old and new section caches via `revalidatePostSection`. [src/app/api/admin/posts/[id]/route.ts]

## src/app/api/admin/projects/

- `async function POST(request: Request): Promise<NextResponse>` — create a project under Serializable isolation; clamps `sortOrder` to `[0, count]` before the shift to avoid gap rows. [src/app/api/admin/projects/route.ts]

## src/app/api/admin/projects/[id]/

- `async function DELETE(...)` — Serializable; closes `sortOrder` gap by decrementing higher rows. [src/app/api/admin/projects/[id]/route.ts]
- `async function GET(...)` [src/app/api/admin/projects/[id]/route.ts]
- `async function PUT(...)` — Serializable; sortOrder shift goes through directional `updateMany`; sections/links replace-all on edit. [src/app/api/admin/projects/[id]/route.ts]

## src/app/api/auth/login/

- `async function POST(request: NextRequest): Promise<NextResponse>` — login; per-IP rate-limit via `clientBucketKey` (Upstash; fail-open on Redis blip), `verifyCredentials`, audit-info-log on success. [src/app/api/auth/login/route.ts]

## src/app/api/auth/logout/

- `async function POST(): Promise<NextResponse>` [src/app/api/auth/logout/route.ts]

## src/app/api/cron/ping/

- `const KEEPALIVE_KEY` — Redis key the cron writes a timestamp to; exported only for the test. [src/app/api/cron/ping/route.ts]
- `async function GET(request: NextRequest): Promise<NextResponse>` — Vercel cron keepalive; constant-time Bearer check via `isAuthorized`; `redis.ping()` + `redis.set(KEEPALIVE_KEY, …)`. [src/app/api/cron/ping/route.ts]

## src/app/api/feed/[section]/

- `async function GET(...)` — Atom feed; `unstable_cache` per section; renders 20 posts as `<entry>` with markdown bodies pre-rendered to HTML inside the cached fn. [src/app/api/feed/[section]/route.ts]

## src/app/api/upload/

- `async function POST(request: Request): Promise<NextResponse>` — Vercel Blob upload; gated on `ALLOW_UPLOADS=true`; Content-Length precheck before `formData()` buffers the body. [src/app/api/upload/route.ts]
- `function sanitizeFilename(name: string): string` — strips path separators, control chars, non-ASCII; UUID prefix carries uniqueness. [src/app/api/upload/route.ts]

## src/app/blog/[section]/

- `async function generateMetadata({ params })` [src/app/blog/[section]/page.tsx]
- `function generateStaticParams()` — yields `{ section }` for each `SECTIONS` entry. [src/app/blog/[section]/page.tsx]
- `default async function BlogListPage({ params, searchParams })` — invalid section → `notFound()`; reads `?page=` via `parsePageParam`. [src/app/blog/[section]/page.tsx]
- `default function BlogListLoading()` [src/app/blog/[section]/loading.tsx]

## src/app/blog/[section]/[slug]/

- `async function generateMetadata({ params })` [src/app/blog/[section]/[slug]/page.tsx]
- `async function generateStaticParams()` — pulls every `getAllPublishedPostSlugs` for SSG. [src/app/blog/[section]/[slug]/page.tsx]
- `default async function PostPage({ params })` — renders `PostContent` + `PostMarkdownContent`; `loadPost(section, slug)` is React.cache-deduped. [src/app/blog/[section]/[slug]/page.tsx]
- `default function PostLoading()` [src/app/blog/[section]/[slug]/loading.tsx]

## src/app/blog/[section]/archive/

- `default function ArchiveLoading()` [src/app/blog/[section]/archive/loading.tsx]
- `async function generateMetadata({ params })` [src/app/blog/[section]/archive/page.tsx]
- `function generateStaticParams()` [src/app/blog/[section]/archive/page.tsx]
- `default async function ArchivePage({ params })` — full chronological list, grouped by year via `getPostsGroupedByYear`. [src/app/blog/[section]/archive/page.tsx]

## src/app/blog/[section]/search/

- `async function generateMetadata({ params })` [src/app/blog/[section]/search/page.tsx]
- `default async function SearchPage({ params, searchParams })` — `searchPosts(section, q)` with `MIN_SEARCH_TERM_LENGTH=2` floor. [src/app/blog/[section]/search/page.tsx]

## src/app/privacy/

- `const metadata` [src/app/privacy/page.tsx]
- `default function PrivacyPage()` [src/app/privacy/page.tsx]

## src/app/privacy/body-tracking/

- `const metadata` [src/app/privacy/body-tracking/page.tsx]
- `default function BodyTrackingPrivacyPage()` [src/app/privacy/body-tracking/page.tsx]

## src/app/projects/

- `const metadata` [src/app/projects/page.tsx]
- `default async function ProjectsPage()` — gallery; calls `getAllProjectsForGallery()` (cached via `unstable_cache` for the default sort path). [src/app/projects/page.tsx]
- `default function ProjectsLoading()` [src/app/projects/loading.tsx]

## src/app/projects/[slug]/

- `async function generateMetadata({ params })` [src/app/projects/[slug]/page.tsx]
- `async function generateStaticParams()` [src/app/projects/[slug]/page.tsx]
- `default async function ProjectPage({ params })` — renders all sections' markdown via `Promise.all(markdownToReact)`. [src/app/projects/[slug]/page.tsx]
- `default function ProjectLoading()` [src/app/projects/[slug]/loading.tsx]

## src/app/tools/loan-calculator/

- `const metadata` [src/app/tools/loan-calculator/page.tsx]
- `default function LoanCalculatorPage()` [src/app/tools/loan-calculator/page.tsx]

## src/components/

- `default function AnimatedCard({ children, index, ... })` — fade-up wrapper that staggers `index * delayMultiplier`; used in list views. [src/components/AnimatedCard.tsx]
- `default function Footer()` [src/components/Footer.tsx]
- `default function FooterYear()` — current-year client island; `suppressHydrationWarning` on stale caches. [src/components/FooterYear.tsx]
- `default function Header()` — pathname-based hide on `/admin/*` (except `/admin/login`) and `/`. [src/components/Header.tsx]
- `default function PageGlow()` — accent-coloured radial-gradient backdrop element. [src/components/PageGlow.tsx]
- `default function ThemeProvider({ initialTheme, children })` — context provider; writes `theme` cookie (incl. `system-{dark,light}` encoding) so server can rehydrate without flash. [src/components/ThemeProvider.tsx]
- `default function ThemeToggle()` — three-option group (System/Light/Dark) with framer `layoutId` for the selection pill. [src/components/ThemeToggle.tsx]
- `default function Typewriter({ phrases, ... })` — phase-machine effect (`typing` ↔ `erasing`) used on landing hero. [src/components/Typewriter.tsx]
- `function useTheme(): ThemeContextValue` — throws if used outside `ThemeProvider`. [src/components/ThemeProvider.tsx]
- `type Theme` — re-exported from `@/lib/theme`. [src/components/ThemeProvider.tsx]

## src/components/about/

- `default function FadeIn({ as, delay, children })` — `motion[as]` with `fadeUp(delay)` variants; `as: keyof typeof motion`. [src/components/about/FadeIn.tsx]

## src/components/admin/

- `default function AdminNav()` — admin-only top nav; `handleLogout` blocks redirect on non-ok / network failure and surfaces an `<ErrorMessage>`. [src/components/admin/AdminNav.tsx]
- `default function AdminPagination({ page, totalPages, urlForPage })` — extracted from the dashboard split; shared by `PostsTab` and `ProjectsTab`. [src/components/admin/AdminPagination.tsx]
- `default function AdminSearch({ tab, query })` — expandable search; tab-aware URL builder (?vs& separator). [src/components/admin/AdminSearch.tsx]
- `default function ErrorMessage({ children, size, className })` — standard `role="alert"` paragraph; `size: sm | md` covers all admin error surfaces. [src/components/admin/ErrorMessage.tsx]
- `default function ImageUpload({ value, onChange, label })` — file-input → `/api/upload`; abort-on-newer-selection. [src/components/admin/ImageUpload.tsx]
- `default function IsFeaturedToggle({ projectId, initialIsFeatured })` — optimistic checkbox PUT to `/api/admin/projects/:id`; `AbortController` on unmount and on rapid retoggle. [src/components/admin/IsFeaturedToggle.tsx]
- `default function LinkManager({ value, onChange })` — admin reorderable link rows; uses `useOrderedList`. [src/components/admin/LinkManager.tsx]
- `default function LoginForm()` [src/components/admin/LoginForm.tsx]
- `default function MarkdownEditor({ value, onChange, label })` — split edit/preview; `preview` cached on last `(input, node)` pair; cancellation flag for fast typing. [src/components/admin/MarkdownEditor.tsx]
- `default function PlatformPicker({ value, onChange })` — keyword-set + freeform; renders a hidden mirror input for required-field validation. [src/components/admin/PlatformPicker.tsx]
- `default function PostForm({ initialData })` — single state object + `setField`; uses `useAdminResource` for save/remove. [src/components/admin/PostForm.tsx]
- `default async function PostsTab({ query, page })` — admin posts list + pagination. [src/components/admin/PostsTab.tsx]
- `default function ProjectAdminControls({ project, totalCount })` — group header for an admin project row; embeds `IsFeaturedToggle` + `ProjectSortOrderInput`. [src/components/admin/ProjectAdminControls.tsx]
- `default function ProjectAdminGroup({ label, projects, totalCount })` — labeled cluster of `ProjectAdminControls`. [src/components/admin/ProjectAdminGroup.tsx]
- `default function ProjectForm({ initialData })` — single state object + `setField`; uses `useOrderedList` for sections and links. [src/components/admin/ProjectForm.tsx]
- `default function ProjectSortOrderInput({ projectId, initialSortOrder, totalCount })` — 1-indexed UI over 0-indexed DB; abort on rapid blur. [src/components/admin/ProjectSortOrderInput.tsx]
- `default async function ProjectsTab({ query, page })` — admin projects list (grouped by platform when not searching). [src/components/admin/ProjectsTab.tsx]
- `default function SectionManager({ value, onChange })` — admin reorderable section rows with nested image lists; uses `useOrderedList`. [src/components/admin/SectionManager.tsx]
- `interface LinkItem` [src/components/admin/LinkManager.tsx]
- `interface OrderedItem` [src/components/admin/useOrderedList.ts]
- `interface OrderedListActions<T>` [src/components/admin/useOrderedList.ts]
- `interface SectionImage` [src/components/admin/SectionManager.tsx]
- `interface SectionItem` [src/components/admin/SectionManager.tsx]
- `function useAdminResource<TPayload>({ resource, id })` — hook returning `save`/`remove`/`isSubmitting`/`error`; `AbortController` per call, mounted-ref guards. `readErrorMessage` appends `(HTTP NNN)`. [src/components/admin/useAdminResource.ts]
- `function useOrderedList<T extends OrderedItem>(initial)` — generates `_key`, compacts `sortOrder` on remove, defers move to `moveAndReorder`. Used by `LinkManager`/`SectionManager`. [src/components/admin/useOrderedList.ts]

## src/components/blog/

- `default function BlogSectionHeader({ section, label })` — heading↔inline-search swap; outside-click closes (re-implements pattern; could reuse `useClickOutside`). [src/components/blog/BlogSectionHeader.tsx]
- `default function Pagination({ page, totalPages, section })` — public blog list pager (separate from admin's `AdminPagination`). [src/components/blog/Pagination.tsx]
- `default async function PostCard({ post })` — list-row card; preview rendered as markdown via `PostMarkdownContent`. [src/components/blog/PostCard.tsx]
- `default function PostContent({ ... })` — single-post chrome: title, formatted date, datetime ISO, reading time. [src/components/blog/PostContent.tsx]
- `default async function PostMarkdownContent({ content })` — `markdownToReact(content)` server-rendered. [src/components/blog/PostMarkdownContent.tsx]
- `default function SearchForm({ section, ... })` — used by the inline blog search and the search page. [src/components/blog/SearchForm.tsx]

## src/components/home/

- `default function HomeHero()` — animated landing intro; uses `Typewriter`. [src/components/home/HomeHero.tsx]
- `default function LandingBackground()` — three animated blurred blobs; `data-blob-bg` attribute lets globals.css gate animation on `prefers-reduced-motion`. [src/components/home/LandingBackground.tsx]

## src/components/loan-calculator/

- `default function LoanCalculatorClient()` — comparison + extra-payments UI; computes via `computeLoan` on every keystroke (no debounce yet). [src/components/loan-calculator/LoanCalculatorClient.tsx]
- `default function LoanCalculatorInput({ label, ... })` — input nested inside `<label>` for implicit a11y association. [src/components/loan-calculator/LoanCalculatorInput.tsx]
- `default function LoanCalculatorSummary({ values, isComparison })` — colored row list; uses CSS color names `coral`/`lightseagreen` (open watch-out: design tokens). [src/components/loan-calculator/LoanCalculatorSummary.tsx]

## src/components/privacy/

- `default function PrivacyPageLayout({ title, sections })` [src/components/privacy/PrivacyPageLayout.tsx]
- `default function PrivacySection({ ... })` [src/components/privacy/PrivacySection.tsx]
- `interface PrivacySectionEntry` [src/components/privacy/PrivacyPageLayout.tsx]

## src/components/projects/

- `default function CompactProjectCard({ ... })` [src/components/projects/CompactProjectCard.tsx]
- `default function FeaturedProjectCard({ ... })` [src/components/projects/FeaturedProjectCard.tsx]
- `default function ProjectContent({ project, renderedDescriptions })` — single-project page chrome; `<style>{":root { --color-header-accent: ${accentColor} }"}</style>` injected into the global cascade because the global header (an ancestor) consumes the variable. Do NOT scope to a wrapper. [src/components/projects/ProjectContent.tsx]
- `default function ProjectSectionCarousel({ images, altPrefix })` — paginate-direction logic; carousel for project section images. [src/components/projects/ProjectSectionCarousel.tsx]

## src/components/ui/

- `const FREEFORM_VALUE` — sentinel used by `PresetOrFreeformInput` to switch into freeform mode. [src/components/ui/PresetOrFreeformInput.tsx]
- `default function EmptyState({ ... })` [src/components/ui/EmptyState.tsx]
- `default function ExpandableSearch({ placeholder, onSubmit, onClose, initialValue, autoFocusOnOpen })` — icon ↔ input swap with framer; `useClickOutside` collapses; Escape closes. [src/components/ui/ExpandableSearch.tsx]
- `default function PresetOrFreeformInput({ value, onChange, options })` — fully derived from `value`; renders preset `<select>` until user picks `FREEFORM_VALUE`, then a free `<input>`. [src/components/ui/PresetOrFreeformInput.tsx]
- `default function ReorderControls({ ... })` — up/down arrows wired with required handlers + `disabled` flag. [src/components/ui/ReorderControls.tsx]
- `function useClickOutside<T>(ref, onOutside, enabled)` — `mousedown`-document listener; `enabled` flag toggles subscription. [src/components/ui/useClickOutside.ts]

## src/lib/

- `class EnvConfigError extends Error` — `code: "ENV_MISSING"`, `varName`; thrown by required-var accessors so middleware can branch on misconfiguration vs. business errors. [src/lib/env.ts]
- `const ADMIN_TABS` [src/lib/adminPageUrl.ts]
- `const PAGE_SIZE = 10` — shared by posts and projects list helpers. [src/lib/pagination.ts]
- `const PLATFORM_BUCKETS` — ordered list `iOS, Mac, Web, Open Source` + implicit `Other` fallback. [src/lib/platforms.ts]
- `const SECTIONS = ["tech", "life"] as const` [src/lib/sections.ts]
- `const getAllPublishedPostSlugs` — `unstable_cache`-wrapped; tagged `"posts"` so `revalidatePostSection` busts it. [src/lib/posts.ts]
- `const loadPost` — `React.cache(getPostBySlug)`; per-request dedupe between `generateMetadata` and the page body. [src/lib/posts.ts]
- `const loadPostForAdmin` — `React.cache(prisma.post.findUnique)`; same dedupe purpose for the admin edit page. [src/lib/posts.ts]
- `const loadProject` — `React.cache(getProjectBySlug)`. [src/lib/projects.ts]
- `const loadProjectForAdmin` — `React.cache(prisma.project.findUnique)` with `projectInclude`. [src/lib/projects.ts]
- `const navLinks` — single source of truth for the global header nav (`Tech`, `Life`, `Projects`, `About`). [src/lib/navigation.ts]
- `const postCreateSchema` — Zod; `datetime` regex enforced at write time to fail loud on bad format instead of 500ing in feed render. [src/lib/schemas.ts]
- `const postListItemSelect` [src/lib/posts.ts]
- `const postUpdateSchema` — `postCreateSchema.partial()`. [src/lib/schemas.ts]
- `const prisma` — global Prisma client singleton; not torn down on shutdown. [src/lib/db.ts]
- `const projectCreateSchema` [src/lib/schemas.ts]
- `const projectInclude` — Prisma include shape for full-project fetch (sections + images + links). [src/lib/projects.ts]
- `const projectUpdateSchema` [src/lib/schemas.ts]
- `const loginSchema` — `email` is `.toLowerCase().trim()`-transformed; case-typos still match the configured admin. [src/lib/schemas.ts]
- `function buildPageMetadata(input: PageMetadataInput): Metadata` — title + description + OpenGraph for every public page. [src/lib/metadata.ts]
- `function bySection<T>(fn)` — utility for "do `fn(section)` for both `tech` and `life`" callers. [src/lib/posts.ts]
- `function buildAdminPageUrl({ tab, query, page })` — canonical `/admin?...` URL builder; default tab + page=1 + empty query produce bare `/admin`. [src/lib/adminPageUrl.ts]
- `function calculateReadingTime(body: string): string` [src/lib/format.ts]
- `function capitalizeSection(section: Section): string` [src/lib/sections.ts]
- `function createBoundedWrapperCache<T>(...)` — FIFO `Map` cache (cap 256, LRU touch); used by `getPostBySlug`/`getProjectBySlug` so 404 probes can't grow wrappers unbounded. [src/lib/boundedCache.ts]
- `function createSlug(title: string): string` — NFKD-normalize, strip combining marks, fold dash variants, collapse repeated/leading/trailing hyphens. [src/lib/format.ts]
- `function currentDatetimeString(): string` — `yyyy-MM-dd-HHmm` of `now`; used to filter future-dated posts. [src/lib/format.ts]
- `function defaultProto(host: string): "http" | "https"` — only `localhost`/`127.0.0.1` hostname (after stripping port) maps to http; everything else https. [src/lib/request.ts]
- `function filterAdminEvents<T>(event)` — Vercel telemetry `beforeSend`; drops events whose URL `pathname === "/admin"` or starts with `/admin/`. [src/lib/analytics.ts]
- `function fadeUp(delay)` — framer `variants` factory shared by FadeIn and AnimatedCard. [src/lib/motion.ts]
- `function formatDate(datetime: string): string` — `yyyy-MM-dd-HHmm` → en-US "Mon DD, YYYY". [src/lib/format.ts]
- `function formatNumber(value, digits=2): string` — pinned to `"en-US"` so SSR and client never disagree on hydration. [src/lib/loanCalculator.ts]
- `function formatPlatformDisplay(platform: string): string` — multi-keyword strings collapse to "Fullstack" / "Multiplatform" rules. [src/lib/platforms.ts]
- `function getAdminCredentials()` — `{ email, passwordHash } | null`; null path triggers the dummy-bcrypt timing defense in `verifyCredentials`. [src/lib/env.ts]
- `function getAllProjects()` [src/lib/projects.ts]
- `function getAllProjectsForGallery({ sortDiscontinued })` — default path uses `unstable_cache` (`projectsGalleryCache`); admin caller passes `sortDiscontinued: false` to bypass. [src/lib/projects.ts]
- `function getCronSecret(): string | null` — null means cron is open (test/dev). [src/lib/env.ts]
- `function getDatabaseUrl(): string` — required; throws `EnvConfigError`. [src/lib/env.ts]
- `function getPostBySlug(section, slug)` — `unstable_cache`-wrapped per-slug via `createBoundedWrapperCache`. [src/lib/posts.ts]
- `function getPostsBySection(section, page)` [src/lib/posts.ts]
- `function getPostsGroupedByYear(posts)` [src/lib/posts.ts]
- `function getProjectBySlug(slug)` — same per-slug bounded-cache pattern as `getPostBySlug`. [src/lib/projects.ts]
- `function getRedisConfig()` — `{ token, url } | null`; SDK and gate share this object. [src/lib/env.ts]
- `function getSessionSecret(): Uint8Array` (lib/auth) — `TextEncoder().encode(getRawSessionSecret())`. [src/lib/auth.ts]
- `function getSessionSecret(): string` (lib/env) — required; throws `EnvConfigError`. [src/lib/env.ts]
- `function groupByPlatform<T>(projects)` — bucket order: iOS → Mac → Web → Open Source → Other. [src/lib/platforms.ts]
- `function handlePrismaError(error, tag?)` — maps `P2025` to 404 NextResponse; warn-logs `${tag} record not found` when tag is passed. [src/lib/apiErrors.ts]
- `function isPlatformRedundantWithSection(platform, sectionLabel)` — hide the platform capsule when it just repeats the bucket header. [src/lib/platforms.ts]
- `function isPrismaNotFound(error)` — `P2025`. [src/lib/db.ts]
- `function isPrismaUniqueConstraint(error)` — `P2002`. [src/lib/db.ts]
- `function isValidSection(value)` — type guard for `Section`. [src/lib/sections.ts]
- `function listPostsForAdmin({ query, page })` [src/lib/posts.ts]
- `function listProjectsForAdmin({ query, page })` — non-search path returns the full table uncached; reports `totalPages: 1`. [src/lib/projects.ts]
- `function lookupLegacySlug(slug)` — `unstable_cache`-wrapped; checks `posts` first, then `projects`. [src/lib/legacySlug.ts]
- `function markdownToHtml(content): Promise<string>` — `remark-rehype` drops raw HTML by default (verified, not added by us). [src/lib/markdown.ts]
- `function markdownToReact(content): Promise<ReactNode>` [src/lib/markdown.ts]
- `function moveAndReorder<T>(list, fromIndex, direction)` — pure: returns a new list with `sortOrder` reassigned by position. OOB returns the original (doc claims contiguous; reality differs — open watch-out). [src/lib/reorder.ts]
- `function parseIdParam(params)` — `{ id: number } | NextResponse` — 400 on non-numeric. [src/lib/apiErrors.ts]
- `function parseIntId(raw): number | null` — strict `^-?\d+$`; rejects `"12abc"` and `"3.7"`. [src/lib/format.ts]
- `function parseJsonBody<T>(request, schema, tag)` — try/catch around `request.json()` + `schema.safeParse`; reused across all admin write handlers. [src/lib/apiErrors.ts]
- `function parsePageParam(raw): number` — clamp `[1, 10_000]`. [src/lib/format.ts]
- `function parseTab(raw): AdminTab` — strict allowlist; unknown values fall back to `"posts"`. [src/lib/adminPageUrl.ts]
- `function platformBucket(platform): string` — word-boundary regex per keyword; `"webhook"` no longer matches `"web"`. [src/lib/platforms.ts]
- `function postDatetimeToISO(datetime): string` — throws on malformed; replaces silent `new Date().toISOString()` fallback. [src/lib/format.ts]
- `function resolveInitialTheme(rawCookie): Theme` [src/lib/theme.ts]
- `function resolveInitialThemeClass(rawCookie)` — server-side resolved theme class string for the html element to avoid theme-flash. [src/lib/theme.ts]
- `function respondInternalError(tag, error)` — logs `${tag}, { requestId }, error` and returns 500 with `{ error, requestId }`. [src/lib/apiErrors.ts]
- `function revalidatePostSection(section)` — busts `feed-${s}`, `blog-${s}`, `posts` tags. [src/lib/posts.ts]
- `function revalidateProject(slug)` — busts `projects` and `project-${slug}` tags. Open follow-up: a slug-changing PUT must call this with both old and new slug. [src/lib/projects.ts]
- `function searchPosts(section, query)` — full-text over title and body; floor `MIN_SEARCH_TERM_LENGTH = 2`. [src/lib/posts.ts]
- `function siteBase(): Promise<string>` — host header → `VERCEL_URL` fallback → throw; `x-forwarded-proto` overrides `defaultProto`. [src/lib/request.ts]
- `function stripMarkdown(markdown): string` — unified AST walk; image alt extracted; fenced code blocks skipped; inline code kept. [src/lib/markdown.ts]
- `function toLinkCreate(links)` — Prisma nested-create input shape. [src/lib/projects.ts]
- `function toProjectFormInitialData(project)` — null→`""` coercion on image captions. [src/lib/projects.ts]
- `function toSectionCreate(sections)` — Prisma nested-create input shape. [src/lib/projects.ts]
- `function truncateBody(body)` — list-page preview truncation; cuts at paragraph boundary near 700 chars. [src/lib/format.ts]
- `function yearFromDatetime(datetime)` — first 4 chars of `yyyy-MM-dd-HHmm`. [src/lib/format.ts]
- `function verifyCredentials(email, password)` — case-sensitive `===` against config; callers normalize via `loginSchema`. Always runs bcrypt regardless of email match (anti-enumeration). [src/lib/auth.ts]
- `function verifySession(): Promise<boolean>` — reads `session` cookie + verifies; used by `/admin/login` redirect and `(protected)/layout.tsx`. [src/lib/auth.ts]
- `async function verifyToken(token, secret)` — `jose.jwtVerify`; `ERR_JWT_EXPIRED` logged at info (routine), other failures at error. [src/lib/auth.ts]
- `async function createSession(): Promise<void>` — signs JWT, sets httpOnly `session` cookie. [src/lib/auth.ts]
- `async function destroySession(): Promise<void>` — deletes `session` cookie. [src/lib/auth.ts]
- `interface AdminPostListItem extends PostListItem` [src/lib/posts.ts]
- `interface AdminPostListResult` [src/lib/posts.ts]
- `interface AdminProjectListResult` [src/lib/projects.ts]
- `interface PageMetadataInput` [src/lib/metadata.ts]
- `interface PostArchiveItem` [src/lib/posts.ts]
- `interface PostDetail` [src/lib/posts.ts]
- `interface PostListItem` [src/lib/posts.ts]
- `interface PostSearchResult` [src/lib/posts.ts]
- `interface ProjectDetail` [src/lib/projects.ts]
- `interface ProjectGalleryItem extends ProjectListItem` [src/lib/projects.ts]
- `interface ProjectListItem` [src/lib/projects.ts]
- `interface SessionPayload extends JWTPayload` [src/lib/auth.ts]
- `type AdminProjectDetail` — `Awaited<ReturnType<typeof loadProjectForAdmin>>` non-nullable. [src/lib/projects.ts]
- `type AdminTab` [src/lib/adminPageUrl.ts]
- `type ComputeParams` [src/lib/loanCalculator.ts]
- `type ComputeReturn` [src/lib/loanCalculator.ts]
- `type Direction = "up" | "down"` [src/lib/reorder.ts]
- `type LegacyMatch` — discriminated union: `{ kind: "post", section, slug } | { kind: "project", slug } | null`. [src/lib/legacySlug.ts]
- `type ProjectLinkInput` [src/lib/projects.ts]
- `type ProjectSectionInput` [src/lib/projects.ts]
- `type Section` [src/lib/sections.ts]
- `type Theme = "light" | "dark" | "system"` [src/lib/theme.ts]
- `default function computeLoan(params: ComputeParams): ComputeReturn` — PMT + amortization loop; throws on `period < 1`, `annualInterestRate < 0`, or `extraPayments.frequency < 1`. [src/lib/loanCalculator.ts]
