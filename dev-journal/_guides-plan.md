# Guides section — plan and SEO checklist

Working doc for the hidden-from-nav guides section (marketing/SEO content with product CTAs, reachable by direct link, llms.txt, and search — not from main navigation). Started 2026-07-17. **Route and name confirmed 2026-07-17: `/guides`.** Ready to build — see Implementation phases at the end.

## Decided

- **Route**: top-level `/guides/:slug`, not `/blog/guides/:slug`. Rationale: blog = dated, subscribed, frozen-after-publish stream (sitemap marks posts `changeFrequency: "never"`); guides = maintained reference pages, edited in place from Search Console data. Different lifecycle → different route. `SECTIONS` stays `["tech", "life"]`; static `/guides` route wins over the `[slug]` legacy catch-all, no conflict.
- **Section name**: "Guides". Label is register, not taxonomy — search/social visitors land on the piece, never the index. Pieces that genuinely aren't guide-shaped are usually blog posts that mention the product.
- **Chrome**: reuse blog post chrome (shared components + markdown pipeline), no new design language.
- **Nav**: not in the header. Footer link to the `/guides` index is the discoverability floor.
- **Project page**: guides appear as a new section below the content, above FAQ — same structural pattern as `ProjectFaq`. Not in the hero `links` pill row (that renders accent CTAs with `target="_blank"` — wrong register for supporting content).
- **No RSS feed** for guides — deliberate; reinforces the non-blog identity.

## Data model

- **New `Guide` entity**, not `Post` reuse. Post carries legacy guides shouldn't inherit (`yyyy-MM-dd-HHmm` datetime string, section, feed/archive/search surfaces, frozen lifecycle); reuse would add a "not guides" filter to every existing post query.
- **Flat URL namespace**: topic hubs and guides both live at `/guides/:slug`. Cross-table slug uniqueness enforced at the app layer on create/update (no cross-table unique in Postgres). Grouping/regrouping never changes a guide's URL.
- First topic (Reckon): "Making better decisions" — use *making*, not *taking*; English search queries use "make better decisions".

Final schema (field names settled 2026-07-17):

```
GuideTopic: id, slug (unique), title, shortDescription (project-page blurb),
            description (hub body, markdown), projectSlug (String?, indexed),
            published (default true), createdAt, updatedAt

Guide:      id, slug (unique), title, description (meta/OG/preview text),
            body (markdown), projectSlug (String?, indexed),
            topicId (FK → GuideTopic, nullable, onDelete: Restrict),
            sortOrder (within topic), readingTime, published (default true),
            publishedAt (DateTime?, set on first publish, feeds JSON-LD
            datePublished), createdAt, updatedAt
```

- **Project reference is by slug, NOT FK** — `import-projects.ts` replaces projects wholesale (delete-then-create in a transaction); an FK would cascade-delete guides or block the importer. Slug is the stable public identity. Integrity enforced in the Zod/API layer + import script: `projectSlug` must exist in projects when set.
- **`projectSlug` is nullable** — future non-product pieces are allowed. Null means: no product CTA, never listed on a project page, still on `/guides` index + sitemap + llms.txt.
- Topic→guide is a real FK (`Restrict` so deleting a topic with guides fails loudly). When `topicId` is set, `guide.projectSlug` must equal `topic.projectSlug` (both-null allowed) — app layer.
- `description` on Guide is load-bearing (meta description, OG description, preview text on project/topic pages).
- `published` exists as a DB column (admin can stage/unpublish without deleting the row) but NOT in frontmatter — drafts live in the source `drafts/` folder; importing is deliberate, so imports are published.
- Guides are dated (`publishedAt`/`updatedAt`, JSON-LD `datePublished`/`dateModified`) — but the date isn't the organizing identity as with `Post.datetime`. Display dateline is "Updated {updatedAt}", never the publish date.
- Real `DateTime` columns throughout — none of Post's string-datetime legacy.

## Authoring & import

No JSON manifest — guides are markdown prose with flat scalar metadata, like posts (projects needed JSON because they're structured non-prose data). Topics are markdown too: the hub body is a landing page, not manifest data.

**Superseded 2026-07-17 (build): topic membership comes from the directory, not a `topic:` key.** A `guides/<folder>/index.md` declares the topic; every other `.md` in that folder is a guide in it. `index.md` (not `_topic.md`) because every guide filename starts with its date prefix, so `index.md` sorts to the bottom on its own. The directory name is decorative — the topic file's own `slug:` is authoritative, same principle as post filenames — so regrouping still can't move a URL. Guides therefore carry no `topic:` key at all: one source of membership, nothing to drift.

A grouped guide also carries no `project:` key — it inherits its topic's, since the DB requires the two to match anyway, and a redundant declaration can only contradict it. Declaring one inside a topic folder is a parse error naming the fix. Ungrouped guides declare their own.

Frontmatter (flat, single-line values; `parseFrontmatterFields` in `src/lib/import/frontmatter.ts` — strict, generalized, no YAML dependency, kept separate from the lenient post `parseFrontmatter`):

```yaml
---
slug: how-to-keep-a-decision-journal   # required, explicit — never derived, never normalized
title: How to keep a decision journal
description: A 150–160 char meta/OG/preview text. Single line.
project: reckon                        # ungrouped guides only; grouped ones inherit
sortOrder: 1                           # optional, order within topic
---
Body markdown, no H1 (chrome renders the title).
```

Topic files (`index.md`) carry: `slug`, `title`, `shortDescription`, `project` (optional); body = hub description.

Source layout — **`~/_Work/projects/blog/guides/`** (moved 2026-07-17; the content lives in the blog repo alongside posts, not in the product repo):

```
blog/guides/
  2026-07-17-How calibrated are you.md   # ungrouped guide
  making-better-decisions/
    2026-07-17-How to keep a decision journal.md
    index.md                             # the topic hub
  drafts/                                # ignored by the importer
```

One level of nesting only; a deeper tree is a layout mistake, and flattening it silently would import guides under the wrong topic. Filenames keep the `yyyy-MM-dd-Title.md` date prefix **for disk sorting only** — the importer ignores the filename entirely (slug + title come from frontmatter). `publishedAt` is therefore stamped at import time, not read from the filename.

Import script — `yarn db:import-guides <folder>`, mirroring the posts importer (NOT the projects one): plan-based and idempotent, create-only by default, `--overwrite` updates in place, `--dry-run`, direct Prisma writes + revalidate reminder. Topics import before guides in the same run. Reading time via the existing post helper. Departures from posts: explicit `slug:` required (loud skip when missing — guide slugs are SEO-load-bearing, chosen not generated); no filename parsing; no publish-state inference. Cross-table slug uniqueness (Guide vs GuideTopic) checked in the shared plan lib that admin routes also call.

**Strict frontmatter validation** (guides have 6 fields vs posts' 2, and the parser's failure modes are silent): error on unknown keys (a typo'd optional key like `topics:` would otherwise import quietly wrong), error on duplicate keys (parser takes the first, ignores the rest), loud failure on non-integer `sortOrder`, validate canonical slug form. Parser's inherent rules, documented for authoring: single-line values only; block must start at byte zero of the file; a value that starts *and* ends with the same quote character gets unquoted (fully quote it properly if it needs quotes at both ends).

## SEO checklist

Minimums (agreed):
1. **Sitemap**: include guides + topic hubs with real `lastModified` and `changeFrequency` (e.g. monthly) — unlike posts' `"never"`.
2. **llms.txt**: add a `## Guides` section (route already renders `## Projects` / `## Site`; slots between them).
3. **Internal links**: footer → `/guides` index; project pages → topic hub / guides section (below content, above FAQ).

Additional:
4. **Article JSON-LD** per guide — adapt `buildBlogPostingJsonLd` (`src/lib/content/postJsonLd.ts`) into an Article builder with `dateModified` populated; render via existing `JsonLdScript`.
5. **"Updated <date>" dateline** instead of publish date — evergreen pages age badly with a visible old publish date.
6. **OG/Twitter card images** via the existing card-image pipeline — social is one of the two distribution channels, so this is load-bearing.
7. **Canonical URLs** in metadata — pages will be shared with tracking params attached.
8. **UTM params** on socially-shared links — Vercel Analytics reads them; only way to separate social from organic per piece.
9. **Slug discipline**: slugs are permanent once shared/indexed; phrase them like the search query. Decide names before publishing.
10. **Post-deploy loop**: resubmit sitemap in Search Console; iterate titles/descriptions from real query data (this is the "maintained page" lifecycle that justified the top-level route).

## Resolved defaults (were open; overridable during build)

- `/guides` index lists topics first (title + shortDescription), then ungrouped guides. Minimal page, footer-linked, same chrome.
- `/guides/[slug]` resolution: look up Guide first, then GuideTopic; 404 via `notFound()` on miss.
- Admin: new guides + topics CRUD alongside posts/projects, reusing post form components where they fit; needs a project picker and an optional topic picker.
- `scripts/imports/*/project.json`: untouched — auto-association means manifests stay marketing-copy-only.

## Implementation phases

All six built on the `guides` branch, 2026-07-17, one commit per phase.

1. ✅ **Schema + data layer**: Prisma models, `lib/db/guides.ts` (+ Next-free `guideMappers` / `guideValidation` / `guideRevalidation` splits so the import script can share them), Zod schemas.
2. ✅ **Public routes**: `/guides` index, `/guides/[slug]` (guide + topic hub), `ProseShell` extracted from `PostContent` so both surfaces share one chrome; metadata (canonical + `modifiedTime` added to `buildPageMetadata` as opt-ins), `buildGuideArticleJsonLd`, "Updated" dateline via a new `formatDateValue`.
3. ✅ **Discoverability**: sitemap entries (real `lastModified`, `changeFrequency: monthly`), `## Guides` section in llms.txt (topics with their guides nested — the only place the grouping is expressed to an agent), footer link.
4. ✅ **Project page**: `ProjectGuides` below content, above FAQ.
5. ✅ **Admin CRUD**: API routes + forms for guides and topics, a third `/admin` tab, guides row in the Revalidate panel.
6. ✅ **Importer**: `parseFrontmatterFields`, `lib/import/guideImport.ts`, `yarn db:import-guides`.

Remaining: the content itself (see Session log), and `yarn db:push` to create the two tables.

Tests at every phase per repo standards.

## Build notes worth keeping

- **Publish state gates only the entity it sits on.** A guide is listed iff `guide.published`; it's *grouped* iff its topic exists and is published. Unpublishing a hub dissolves the grouping but leaves its guides live, listed (as ungrouped), and in the sitemap. The alternative — cascading topic state to guides — would silently deindex live pages, the one thing an SEO surface can't afford. The admin form says this out loud.
- **A topic changing project cascades to its guides** (inside the PUT's transaction, with a log breadcrumb). The `guide.projectSlug === topic.projectSlug` invariant is enforced on every guide write, so a topic edit that skipped it would make the rule a lie. Refusing the edit instead would make a legitimate move impossible without unlinking each guide first.
- **PUT validates *effective* values** (`payload ?? persisted`), not payload values — so patching only `topicId` still coheres with the project already on the row. This is the gap the projects PUT still has (2026-05-21 watch-out); deliberately not repeated.
- **`formatDateValue` pins UTC and does NOT share an implementation with `formatDate`**, despite identical output. A post's `yyyy-MM-dd` is a calendar day by construction; a guide's `updatedAt` is an instant. Folding them together would shift every post's date by a day in any zone behind UTC.
- **Canonical URLs are opt-in** (`canonicalPath`), not defaulted to `path`. Only guides pass it. Turning it on site-wide would assert a canonical for pages nobody has audited for multi-path reachability — a one-line change if that audit ever happens.
- **`AdminSearch` now builds URLs through `buildAdminPageUrl`** instead of a hand-rolled posts/projects ternary that would have pointed every guides search at the projects list.

## Follow-ups (not part of the build)

- **`write-guide` skill** (global, like `write-blog-post`): guide register (search-facing, CTA rules), frontmatter spec from this plan, slug-as-query phrasing, 150–160-char descriptions, topic linking, marketing/ai-tone rules. Build it via `skill-creator` after the first guides ship, so real exemplars exist.

## Session log

- 2026-07-17: direction settled, route/name confirmed (`/guides`), manifests paragraphed (`\n\n` splits in both `scripts/imports/*/project.json` — re-import pending, note it clobbers admin edits), this plan made build-ready.
- 2026-07-17 (later): DB schema finalized (slug-based project reference — FK would collide with the project importer's delete-then-create; `projectSlug` nullable for future non-product pieces; `published` DB-only, not frontmatter), frontmatter + source layout + importer semantics specced (all-markdown, no JSON; date-prefixed filenames for disk sorting only), `write-guide` skill noted as follow-up.
- 2026-07-17 (build): all six phases built on the `guides` branch. Two spec changes during the build, both above: topic membership moved from a `topic:` frontmatter key to the directory (`<folder>/index.md`), and the content source moved from the product repo to `blog/guides/`. Still open: `yarn db:push` (Roland runs it), and the four Reckon guides — copied into `blog/guides/making-better-decisions/`, still needing an `index.md`, date prefixes, frontmatter cleaned to the spec above, and their placeholder internal links (`/slug`, `APP_STORE_URL`) resolved.
