# Plan: SEO fields for project pages (metaTitle, keywords, offers, JSON-LD)

> Cross-checked against the live repo on 2026-06-28 (file:line refs verified by reading the
> actual files, not inferred). Status legend: **✅ DONE** = already in the repo, verify and move
> on · **⬜ TODO** = genuinely missing.

## What changed since the first draft of this plan

The FAQ feature was added to this repo **mid-session** (by Roland), so large parts of the original
plan are already implemented. Nothing here is deleted — the FAQ steps are kept and marked ✅ so you
can cross-check them. The genuinely remaining work is small:

- ⬜ `metaTitle` (drives `<title>`), `keywords`, `offers` — three new project fields.
- ⬜ `FAQPage` + `SoftwareApplication` JSON-LD (the FAQ *renders*, but emits no structured data).
- ⬜ **Critical:** sync the authored manifest into the import folder — the importer reads a
  **stale copy** today (see Section F).

### Why this matters (don't lose the thread)
The Continuum landing page is the main acquisition channel for a Mac app the App Store barely
surfaces. The `<title>` tag is currently `name | Roland Leth` → `"Continuum | Roland Leth"`, a brand
word nobody searches. `metaTitle` fixes that. The JSON-LD makes the page citable by ChatGPT /
Perplexity / AI Overviews ("what Mac app keeps private notes on direct reports") — the highest-
leverage win for a low-discoverability app.

---

## Section A — FAQ feature: ✅ DONE end-to-end (cross-check, do NOT redo)

| Layer | File:line | Status |
|---|---|---|
| Prisma `Project.faqs` + `ProjectFaq` model | `prisma/schema.prisma:85`, `:151–159` | ✅ |
| Zod `faqs` field | `src/lib/api/schemas.ts:203` (uses `projectFaqSchema`) | ✅ |
| Mapper `toFaqCreate` + `ProjectFaqInput` | `src/lib/db/projectMappers.ts:21–25, 76–88` | ✅ |
| `ProjectDetail.faqs` | `src/lib/db/projects.ts:74–80` | ✅ |
| `projectInclude.faqs` | `src/lib/db/projects.ts:287` | ✅ |
| Re-exports (`toFaqCreate`, `ProjectFaqInput`) | `src/lib/db/projects.ts:271–278` | ✅ |
| Import write path | `scripts/import-projects.ts:314` (`faqs: toFaqCreate(data.faqs)`) | ✅ |
| Admin **POST** | `src/app/api/admin/projects/route.ts:44, 94` | ✅ |
| Admin **PUT** | `src/app/api/admin/projects/[id]/route.ts` | ⚠️ **VERIFY** mirrors POST |
| Server-render of Markdown answers | `src/app/projects/[slug]/page.tsx:57–61` | ✅ |
| `<ProjectFaq>` wired + destructured | `src/components/projects/ProjectContent.tsx:9, 18, 37` | ✅ |
| **Placement** (last on page, below gallery + description — as Roland wanted) | `ProjectContent.tsx:424–431` | ✅ |
| Accordion component (accessible, animated) | `src/components/projects/ProjectFaq.tsx` | ✅ |
| **`FAQPage` JSON-LD** | — | ⬜ **MISSING** (see Section E) |

The FAQ content (5 Q&As) is already authored in the Continuum manifest's `faq` array — see Section F
for getting it into the DB.

---

## Section B — `metaTitle` → drives `<title>`: ⬜ TODO

Scalar field. Because `loadProject` uses Prisma `include` (not `select`), new scalar columns flow to
`ProjectDetail` automatically once the column + type exist — no `projectInclude` change needed.

1. **`prisma/schema.prisma`** — add to `Project` (after `summary`, ~line 56):
   ```prisma
   metaTitle      String?
   ```
2. **`src/lib/api/schemas.ts`** — add to `projectFields` (~line 188):
   ```typescript
   metaTitle: z.string().max(60).nullable().optional(),
   ```
3. **`scripts/import-projects.ts`** — add to `writeProject`'s create `data` (~line 288):
   ```typescript
   metaTitle: data.metaTitle ?? null,
   ```
   (No separate manifest type to edit — `writeProject`'s `data` is typed from
   `projectCreateSchema.parse`, so the zod field above is enough.)
4. **`src/lib/db/projects.ts`** — add to `ProjectDetail` (~line 38):
   ```typescript
   metaTitle: string | null
   ```
5. **`src/app/projects/[slug]/page.tsx`** — `generateMetadata` (line 31):
   ```typescript
   title: project.metaTitle ?? project.name,
   ```
   Safe: `buildPageMetadata` throws only if the title contains "Roland Leth" (`metadata.ts:33`);
   our metaTitle doesn't. `name` still drives the `<h1>` and gallery card — only `<title>` changes.
6. **`src/app/api/admin/projects/route.ts`** — add `metaTitle` to the destructure (~line 44) and
   `metaTitle: metaTitle ?? null,` to the create `data` (~line 91). Mirror in the **PUT** handler.

## Section C — `keywords`: ⬜ TODO (low SEO value, included for completeness)

Google ignores the keywords meta tag — keep this lightweight. Same scalar-array plumbing as B:

1. **`schema.prisma`** `Project`: `keywords String[] @default([])`
2. **`schemas.ts`** `projectFields`: `keywords: z.array(z.string().min(1).max(50)).max(10).optional(),`
3. **`import-projects.ts`** `writeProject` data: `keywords: data.keywords ?? [],`
4. **`projects.ts`** `ProjectDetail`: `keywords: string[]`
5. **`src/lib/content/metadata.ts`**:
   - add `keywords?: string[]` to `PageMetadataInput` (~line 9)
   - destructure `keywords` (line 25) and add `keywords,` to the returned `Metadata` (~line 46)
6. **`page.tsx`** `generateMetadata`: pass `keywords: project.keywords,`
7. **Admin POST/PUT**: destructure + `keywords: keywords ?? [],` in create data.

## Section D — `offers` (JSON column, feeds SoftwareApplication pricing): ⬜ TODO

1. **`schema.prisma`** `Project`: `offers Json?`
2. **`schemas.ts`** `projectFields`:
   ```typescript
   offers: z
     .array(
       z.object({
         name: z.string().min(1).max(60),
         price: z.string().min(1).max(20),
         priceCurrency: z.string().length(3),
         billingPeriod: z.string().max(10).optional(),
         sortOrder: z.number().int().min(0).optional(),
       })
     )
     .optional(),
   ```
3. **`import-projects.ts`** `writeProject` data:
   ```typescript
   offers: data.offers ?? Prisma.JsonNull,   // Json column null needs Prisma.JsonNull, not null
   ```
   (Import `Prisma` from the generated client — `scripts/import-projects.ts` already imports
   `PrismaClient`; add the `Prisma` namespace.)
4. **`projects.ts`** `ProjectDetail` — Prisma returns `Json?` as `JsonValue`, so type + narrow:
   ```typescript
   offers:
     | { name: string; price: string; priceCurrency: string; billingPeriod?: string; sortOrder?: number }[]
     | null
   ```
   In whatever maps the row → `ProjectDetail`, cast the `offers` column
   (`row.offers as ProjectDetail["offers"]`). If the row already spreads through verbatim, just keep
   the type; only add a cast if `tsc` complains about `JsonValue`.
5. Consumed only by the SoftwareApplication JSON-LD (Section E).
6. **Admin POST/PUT**: destructure + `offers: offers ?? Prisma.JsonNull,` in create data.

## Section E — JSON-LD (FAQPage + SoftwareApplication): ⬜ TODO

Inject **server-side** in `page.tsx` (not the client `ProjectContent`) — render a fragment with the
`<script>` tags before `<ProjectContent>`:

```tsx
export default async function ProjectPage({ params }: Props) {
  // ...existing loadProject + renderedDescriptions + renderedFaqAnswers...

  const jsonLd: object[] = []

  if (project.faqs.length > 0) {
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: project.faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer }, // raw markdown answer; plain prose
      })),
    })
  }

  if (project.bucket === "iOS" || project.bucket === "Mac") {
    const prices = (project.offers ?? []).map((o) => Number(o.price))
    jsonLd.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: project.name,
      description: project.summary,
      applicationCategory: "BusinessApplication", // accurate for Continuum
      operatingSystem: project.bucket === "iOS" ? "iOS" : "macOS",
      url: `https://roland.leth.ro/projects/${project.slug}`,
      image: resolveOgImage(project),
      author: { "@type": "Person", name: "Roland Leth" },
      ...(prices.length
        ? {
            offers: {
              "@type": "AggregateOffer",
              priceCurrency: project.offers![0].priceCurrency,
              lowPrice: String(Math.min(...prices)),  // 12
              highPrice: String(Math.max(...prices)), // 249
              offerCount: prices.length,              // 3
            },
          }
        : {}),
    })
  }

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <ProjectContent
        project={project}
        renderedDescriptions={renderedDescriptions}
        renderedFaqAnswers={renderedFaqAnswers}
      />
    </>
  )
}
```

Notes:
- **No `aggregateRating`** unless you have real reviews — Google penalizes invented rating markup.
- `SoftwareApplication` emits only for `iOS`/`Mac` buckets, so Web/OSS projects aren't mislabeled.
- FAQ answers are Markdown; using the raw `f.answer` string is fine (it's plain prose). If any answer
  ever gains heavy Markdown, strip it to text before putting it in `acceptedAnswer.text`.

---

## Section F — ⚠️ CRITICAL: sync the manifest, then migrate + import

**There are two manifests, and the importer reads the wrong one for our purposes:**

- **Authoring source (already updated this session):**
  `~/_Work/projects/Continuum/marketing/landing-page/project.json` — has the new keyword-bearing
  `summary`, the threaded section copy, and the new `metaTitle` / `keywords` / `offers` / `faq`.
- **What `yarn db:import-projects` actually reads:**
  `roland.leth.ro/scripts/imports/continuum/project.json` — verified **STALE** (still the old
  keyword-free summary, none of the new fields).

The importer scans `scripts/imports/<name>/project.json` (`scripts/import-projects.ts` →
`IMPORTS_DIR`), delete-then-creates by slug, and validates with `projectCreateSchema.parse` (no
`.strict()`, so unknown keys are silently dropped — which is why the schema edits in B–D must land
*before* the import, or the new fields vanish).

**Order of operations:**
1. Land all code edits (Sections B–E) **first** — especially the zod fields, or the import strips
   `metaTitle`/`keywords`/`offers`.
2. **Sync the manifest + images** into `scripts/imports/continuum/`. Prefer the
   **`app-copy-to-project` skill** (it stages the manifest *and* the image files the way the importer
   expects). Manual fallback: copy `Continuum/marketing/landing-page/project.json` →
   `scripts/imports/continuum/project.json` and ensure the referenced `./*.png` assets are present in
   that folder.
3. Migrate, import, verify:
   ```bash
   yarn prisma migrate dev --name add_project_seo_fields   # metaTitle, keywords, offers columns
   yarn db:import-projects                                  # or: yarn db:import-projects continuum
   yarn tsc --noEmit                                        # or the repo's typecheck script
   yarn build
   ```

---

## Acceptance checklist
- [ ] `<title>` on `/projects/continuum` = `1:1 & direct-report notes for managers (Mac) | Roland Leth`
- [ ] `<meta name="description">` = the new keyword-bearing summary (Mac, managers, notes, 1:1 in first ~155 chars)
- [ ] Page `<h1>` still reads just **"Continuum"**; gallery card label unchanged
- [ ] FAQ still renders last on the page (it already does) and now also emits `FAQPage` JSON-LD
- [ ] `FAQPage` + `SoftwareApplication` validate in the [Rich Results Test](https://search.google.com/test/rich-results) — `AggregateOffer` low 12 / high 249 / count 3, `operatingSystem: macOS`
- [ ] Non-app (Web/OpenSource) projects emit **no** `SoftwareApplication` block
- [ ] Imported summary in the DB is the new one (confirms the manifest sync worked)

## Open items to verify (don't assume)
- [ ] Admin **PUT** (`api/admin/projects/[id]/route.ts`) threads `metaTitle`/`keywords`/`offers` (and
      already threads `faqs`) — confirm it mirrors the POST handler.
- [ ] `scripts/imports/continuum/project.json` ends up identical to the authored marketing manifest
      after the sync (diff them).

## Optional AI-SEO follow-ons (separate, low-effort)
- **robots.txt** — confirm AI crawlers aren't blocked: `GPTBot`, `ChatGPT-User`, `PerplexityBot`,
  `ClaudeBot`, `Google-Extended`, `Bingbot`. Next.js default allows all; if you add `src/app/robots.ts`,
  keep them allowed and reference the sitemap.
- **`/llms.txt`** at the site root — short plain-language site overview + one line per project so AI
  systems get clean context. See llmstxt.org.
