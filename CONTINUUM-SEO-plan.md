# Plan: SEO fields + landing-page FAQ for project pages

## Goal / context (read first)

The Continuum landing page (`/projects/continuum`) is the primary acquisition channel for a
Mac app the App Store barely surfaces, so the page's organic-search ranking and its
**citability by AI answer engines** (ChatGPT, Perplexity, Google AI Overviews) matter more than
usual. Three on-page levers are currently unused:

1. **`<title>` tag** — today it's `name + " | Roland Leth"` → `"Continuum | Roland Leth"`, a
   brand word nobody searches. We add an optional **`metaTitle`** that drives `<title>` instead.
2. **A visible FAQ** with **`FAQPage` JSON-LD** — self-contained 40–60-word answers are exactly
   what AI engines extract and cite. This is the single highest-leverage addition for this app.
3. **`SoftwareApplication` JSON-LD** — states "this page is a macOS BusinessApplication that does
   X, priced Y" as machine-readable fact; enables price/app rich results and AI citation.

This is a **data-driven** change: new optional fields on `project.json` → zod → import → Prisma →
render, so Reckon and every future app get the same SEO surface for free. All changes are
**additive** (new nullable columns + one new `ProjectFaq` table) — nothing existing breaks.

## Already done (in the Continuum repo — do NOT redo)

`~/_Work/projects/Continuum/marketing/landing-page/project.json` already has:

- Rewritten **`summary`** (now keyword-bearing: Mac, managers, notes, people they lead, 1:1, reviews).
- Light keyword threading in 3 section descriptions ("A person in full", "Beliefs over time",
  "Private by design").
- New fields populated and waiting for this session to consume them: **`metaTitle`**,
  **`keywords`**, **`offers`**, **`faq`** (5 Q&As).

This session's job is purely the **portfolio code** to read those fields, plus the **FAQ render**.
After the code is in, re-run the project import to pull the new fields into the DB.

## New project.json fields (reference — these are the shapes to validate/store)

```jsonc
"metaTitle": "1:1 & direct-report notes for managers (Mac)",   // string, max 60
"keywords": ["1:1 notes app", "manager notes app", ...],         // string[]
"offers": [                                                      // optional, app projects only
  { "name": "Monthly",  "price": "12.00",  "priceCurrency": "USD", "billingPeriod": "P1M", "sortOrder": 1 },
  { "name": "Yearly",   "price": "108.00", "priceCurrency": "USD", "billingPeriod": "P1Y", "sortOrder": 2 },
  { "name": "Lifetime", "price": "249.00", "priceCurrency": "USD", "sortOrder": 3 }
],
"faq": [                                                         // optional
  { "question": "...", "answer": "...", "sortOrder": 1 },
  ...
]
```

---

## Edit list (ordered)

### 1. `prisma/schema.prisma` — `Project` model + new model + migration
Add to the `Project` model:
```prisma
  metaTitle      String?
  keywords       String[]         @default([])
  offers         Json?
  faqs           ProjectFaq[]
```
Add a new model (mirrors the existing `ProjectLink`/`ProjectSection` related-model convention):
```prisma
model ProjectFaq {
  id        Int     @id @default(autoincrement())
  projectId Int
  project   Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  question  String
  answer    String
  sortOrder Int     @default(0)
}
```
`offers` is a `Json?` column (small, render-only, SoftwareApplication-specific — a related model
would be overkill; this is the one deliberate deviation from the related-model convention).
Migration: `yarn prisma migrate dev --name add_project_seo_fields`

### 2. `src/lib/api/schemas.ts` — `projectFields` object (~L175–196)
Add inside `projectFields`:
```typescript
  metaTitle: z.string().max(60).nullable().optional(),
  keywords: z.array(z.string().min(1).max(50)).max(10).optional(),
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
  faq: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        answer: z.string().min(1).max(5000),
        sortOrder: z.number().int().min(0).optional(),
      })
    )
    .optional(),
```

### 3. `src/lib/import/projectImport.ts` — `ProjectManifest` type (~L46–67)
Add to `ProjectManifest`:
```typescript
  metaTitle?: string | null
  keywords?: string[]
  offers?: { name: string; price: string; priceCurrency: string; billingPeriod?: string; sortOrder?: number }[]
  faq?: { question: string; answer: string; sortOrder?: number }[]
```

### 4. `src/lib/db/projectMappers.ts` — add FAQ mapper (after `toLinkCreate`)
```typescript
export type ProjectFaqInput = { question: string; answer: string; sortOrder?: number }

export function toFaqCreate(faqs: ProjectFaqInput[] | undefined) {
  if (faqs == null) return undefined
  return { create: faqs.map((f) => ({ question: f.question, answer: f.answer, sortOrder: f.sortOrder ?? 0 })) }
}
```
`offers` needs no mapper — it's stored as-is into the `Json?` column.

### 5. `src/lib/db/projects.ts`
- **`ProjectDetail` interface (~L34–74):** add
  ```typescript
  metaTitle: string | null
  keywords: string[]
  offers: { name: string; price: string; priceCurrency: string; billingPeriod?: string; sortOrder?: number }[] | null
  faqs: { id: number; question: string; answer: string; sortOrder: number }[]
  ```
  (`offers` comes back from Prisma as `JsonValue`; cast/narrow it when shaping `ProjectDetail`.)
- **`projectInclude` (~L271–278):** add `faqs: { orderBy: { sortOrder: "asc" as const } },`
- **Re-export block (~L264–269):** add `toFaqCreate` and `type ProjectFaqInput`.
- **`gallerySelect` (~L76–104):** leave as-is — list/gallery views don't need these fields.

### 6. `src/lib/content/metadata.ts`
- `PageMetadataInput` (~L3–10): add `keywords?: string[]`
- `buildPageMetadata` (~L24): destructure `keywords`; add `keywords,` to the returned `Metadata`.

### 7. `src/app/projects/[slug]/page.tsx` — `generateMetadata` (~L22–38)
```typescript
return buildPageMetadata({
  title: project.metaTitle ?? project.name,   // <-- metaTitle drives <title>
  description: project.summary,
  path: `/projects/${project.slug}`,
  image: resolveOgImage(project),
  keywords: project.keywords,
})
```
Note: `name` still feeds the `<h1>` and the gallery card — only `<title>` changes. Good (clean H1,
strong title tag).

### 8. `src/components/projects/ProjectContent.tsx` — FAQ render + JSON-LD
- Destructure `faqs`, `offers` from `project`.
- **Placement (per Roland):** the visible FAQ goes **below the gallery + section description block,
  near the end of the content column** — after the `sections` render, before/after the external
  `links` row. Not under the intro paragraph.
- Visible FAQ uses native `<details>`/`<summary>` (accessible, no JS, progressively enhanced):
  ```tsx
  {faqs?.length > 0 && (
    <section className="mt-12">
      <h2 className="mb-6 text-2xl font-bold" style={{ color: accent }}>
        Frequently asked questions
      </h2>
      <div className="space-y-3">
        {faqs.map((item) => (
          <details key={item.id} className="rounded-lg border border-(--color-border) px-4 py-3">
            <summary className="cursor-pointer font-medium text-primary">{item.question}</summary>
            <p className="text-secondary mt-3 text-sm leading-relaxed">{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  )}
  ```
- **`FAQPage` JSON-LD** (emit whenever `faqs.length > 0`):
  ```tsx
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.question,
      acceptedAnswer: { "@type": "Answer", text: f.answer },
    })),
  }) }} />
  ```
- **`SoftwareApplication` JSON-LD** (emit only for app buckets — `bucket === "iOS" || bucket === "Mac"`):
  ```tsx
  <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    description: summary,
    applicationCategory: "BusinessApplication",            // accurate for Continuum
    operatingSystem: bucket === "iOS" ? "iOS" : "macOS",
    url: `https://roland.leth.ro/projects/${project.slug}`,
    image: resolveOgImage(project),
    author: { "@type": "Person", name: "Roland Leth" },
    ...(offers?.length ? { offers: {
      "@type": "AggregateOffer",
      priceCurrency: offers[0].priceCurrency,
      lowPrice: String(Math.min(...offers.map((o) => Number(o.price)))),   // 12.00
      highPrice: String(Math.max(...offers.map((o) => Number(o.price)))),  // 249.00
      offerCount: offers.length,                                            // 3
    } } : {}),
  }) }} />
  ```
  Do **not** add `aggregateRating` unless there are real reviews — Google penalizes invented rating
  markup. (If you later generalize `applicationCategory` across non-business apps, add an optional
  `appCategory` field rather than guessing from bucket.)

### 9–10. Admin API routes
- `src/app/api/admin/projects/route.ts` (POST): destructure `metaTitle, keywords, offers, faq` from
  `parsed`; add `metaTitle: metaTitle ?? null`, `keywords: keywords ?? []`, `offers: offers ?? null`,
  `faqs: toFaqCreate(faq)` to the `create` data; import `toFaqCreate`.
- `src/app/api/admin/projects/[id]/route.ts` (PUT): `metaTitle/keywords/offers` ride through `rest`
  (schema is `.partial()`); extract `faq` and, inside the transaction, mirror the section/link
  delete-then-recreate:
  ```typescript
  if (faq != null) {
    await tx.projectFaq.deleteMany({ where: { projectId: id } })
    if (faq.length > 0) await tx.projectFaq.createMany({ data: toFaqCreate(faq)?.create ?? [] })
  }
  ```

---

## Run + verify

```bash
yarn prisma migrate dev --name add_project_seo_fields
yarn db:import-projects          # re-import so Continuum's new fields land in the DB
yarn tsc --noEmit                # or the repo's typecheck script
yarn build                       # confirm the page renders
```

## Acceptance checklist
- [ ] `<title>` on `/projects/continuum` = `1:1 & direct-report notes for managers (Mac) | Roland Leth`
- [ ] `<meta name="description">` = the new keyword-bearing summary (truncates gracefully ~155 chars)
- [ ] `<meta name="keywords">` present (low SEO value, harmless)
- [ ] Visible FAQ renders below the gallery/description block; `<details>` expand/collapse works
- [ ] Page H1 still reads just **"Continuum"**; gallery card label unchanged
- [ ] `FAQPage` + `SoftwareApplication` JSON-LD validate in the
      [Rich Results Test](https://search.google.com/test/rich-results) — `AggregateOffer` shows
      low 12.00 / high 249.00 / count 3, `operatingSystem: macOS`
- [ ] Non-app projects (Web/OpenSource buckets) emit **no** `SoftwareApplication` block

## Optional AI-SEO follow-ons (separate, low-effort)
- **robots.txt** — confirm AI crawlers aren't blocked: `GPTBot`, `ChatGPT-User`, `PerplexityBot`,
  `ClaudeBot`, `Google-Extended`, `Bingbot`. Next.js default allows all; if you add `src/app/robots.ts`,
  keep them allowed and reference the sitemap. Blocking any of them = that engine can't cite you.
- **`/llms.txt`** at the site root — short plain-language overview of the site + a one-line entry per
  project (incl. Continuum's positioning) so AI systems get clean context. See llmstxt.org.
