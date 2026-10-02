# Product page for own apps: implementation plan

Written 2026-10-01. Design reference: `redesign-project-page/round2/v1a-improved.html` (Digest, desktop, light; kept out of git). Digest's content: `scripts/imports/digest/project.json` and its `NOTES.md` (gitignored).

**Status, 2026-10-01:** phases 1 to 6 built on the `product-page` branch. Not yet seen in a browser: the database needs the new columns first (see "Needs you"). Changes from the plan below: the page shows no date and no "Made by"; the palettes were worked out per app and theme (in the manifests); price labels read any single-unit ISO duration ("every 3 months"), not only `P1M` and `P1Y`.

## Scope

- Own apps (`isOwnApp`) get the new layout. Every other project keeps `ProjectContent` and its tabs.
- One template for all own apps. Differences come from data: band colours, hero lines, plans, how many sections.
- Not in scope: copy for Reckon and Continuum (hero lines, plans), Digest's images, the copy review against the writing and SEO rules.

## Data model

All additive and nullable, so `db:push` drops nothing. The schema push has to reach the database before a deploy that reads the new columns.

**Project**

| Field | Type | Limit | Use |
|---|---|---|---|
| `metaDescription` | `String?` | 160 | Meta description; falls back to `summary` |
| `heroEyebrow` | `String?` | 80 | In the `h1`, after the name |
| `heroHeadline` | `String?` | 80 | In the `h1`, last |
| `heroImageAlt` | `String?` | 300 | Alt text for `heroImage` |
| `storeNote` | `String?` | 120 | Under the store button, in the hero and the closing |
| `closingHeadline` | `String?` | 80 | Closing `h2` |
| `closingBody` | `String?` | 200 | Under the closing headline |
| `disclaimer` | `String?` | 300 | Row above the site footer |
| `plans` | `Json?` | | `[{ name, isHighlighted, features[], sortOrder }]` |
| `palette` | `Json?` | | `{ light: P, dark: P }`, P = `{ band, bandInk, bandInk2, bandHighlight, accentText }`, all hex |

**ProjectSection**: `hasPlans Boolean @default(false)`. The plan cards render inside this section.

**ProjectSectionImage**: `alt String?`. Alt resolves `alt ?? caption ?? "{section title} screenshot"`.

**Offer** (inside the `offers` JSON): optional `plan`, the name of the plan the price belongs to.

Validation (`projectCreateSchema`):
- Plan names are unique, and at most one plan is highlighted.
- When `plans` is set, every offer names a plan that exists.
- At most one section has `hasPlans`.
- Every palette value is a hex colour, and both themes are present.

## Write paths

- **Import** (`scripts/import-projects.ts`): map every new field; JSON columns write `Prisma.DbNull` when absent.
- **Admin API** (`POST`, `PUT`): project fields flow through the parsed `data`; `toSectionCreate` maps `hasPlans` and image `alt`.
- **Admin form**: a "Product page" group, shown for own apps, with the eight text fields. `SectionManager` gets an alt input per image and a "Holds the plans" checkbox per section. These two are required, not optional: the `PUT` route replaces sections wholesale, so a form that doesn't carry them deletes them on save.
- `plans`, `palette` and `offers` stay manifest-only, like `offers`, `metaTitle` and `keywords` today.

## Rendering

`src/app/projects/[slug]/page.tsx` picks the layout by `isOwnApp`. The new layout is server-rendered, with client parts only where state lives.

| Part | Kind | Notes |
|---|---|---|
| `ProductPage` | server | Composition and palette CSS variables (a `<style>` block, like the header accent today) |
| `ProductHero` | server | Band when the project has a palette, plain otherwise. Split with the image when there is a hero image. One `h1` (name, eyebrow, headline) with visually hidden ": " and ". " between them. Store button, "See how it works" when a section has numbered steps, store note. CSS fade, off under reduced motion. |
| `ProductToc` | client | Shown at 6 sections or more. Sticky list from 1080px, with the current section marked. A collapsed "On this page" under the hero on narrower screens. |
| `ProductSection` | server | `h2` with an id from `createSlug(title)`, de-duplicated. Image sections stack heading, gallery, text. Image-less sections split heading left, text right. |
| `ProductGallery` | client | One provider for the page: a carousel per section, one lightbox across every image. Only the first image on the page gets `priority`. Hairline and shadow on every screenshot. |
| `ProductPlans` | server | One card per plan, prices at the top, the highlighted plan on the band colour. Inside the flagged section, after its heading. With plans and no flagged section, a "Pricing" section before the FAQ. A store button after the section's text. |
| `ProductFaq` | server | Native `details`; lines between questions only. Answers stay in the HTML. |
| `ProductClosing` | server | Band, icon, name, closing headline and body, store button, store note. |
| Guides | existing | `ProjectGuides`, after the closing. |
| Meta row | server | Disclaimer and the non-store links (Privacy, Support). No date. |

Price labels come from `billingPeriod`: `P1M` is "a month", `P1Y` "a year", none "once"; a price of 0 has no label.

**Numbered steps.** A section body's `### 1. Title` headings become the numbered steps: a small rehype plugin in a product-only markdown processor wraps each heading and the paragraphs after it in an ordered list item, with the number in its own element and a visually hidden ". ". Bodies without that pattern render as plain prose.

**Metadata.** `metaDescription ?? summary` for every project. The JSON-LD builders don't change; the offer's `plan` key is ignored there.

## Phases

Each phase is one commit on the `product-page` branch in the main checkout.

1. **Data layer.** Schema, `prisma generate`, Zod schemas and refinements, mappers, import script, API routes, metadata fallback. Tests for every refinement and mapping.
2. **Admin.** Product-page fields, section checkbox, image alt. Tests that both survive a save.
3. **Layout core.** Page branch, hero, sections, steps plugin, gallery provider, FAQ, closing, meta row. Tests: every section's text and id in the server HTML, one `h1`, alt resolution, one priority image, the legacy layout untouched.
4. **Pricing and navigation.** Plans, the mid-page store button, the table of contents with its threshold and current-section marker.
5. **Palette and themes.** Light and dark palettes, the accent text shade, phone layout checked against round 2's phone export.
6. **Manifests.** Final field names in Digest's manifest; palettes for Reckon and Continuum.

## Decisions (confirmed 2026-10-01)

1. The admin form edits the text fields, the section's plans flag and image alt text; `plans`, `palette` and `offers` stay manifest-only.
2. Dark theme: every project with a palette sets both themes. Digest keeps a deep band; Reckon and Continuum have light tinted bands with dark variants. All small-text pairs checked at 4.5:1 or better.
3. Numbered steps come from the `### 1. Title` pattern in the markdown, not from a separate field.

## Revision 2: section kinds (decided 2026-10-02)

Seen in a browser, the first build fell short of the design in three places: steps lived in markdown and couldn't hold their own images, pricing only worked with a `plans` list, and whether a section sat side by side depended on it having no image. This revision replaces decision 3 above, the `hasPlans` flag, the "no image means side by side" rule and the section-list threshold (the rail now shows on every product page, already built).

**Sections** stay one ordered list. Every section has a required `kind`:

| Kind | Layout | Rail |
|---|---|---|
| `text`, `layout: "stacked"` | Title, gallery, text. The main sections, as in the mock. | One entry |
| `text`, `layout: "split"` | Title on the left; text on the right with its gallery under it. "Test a suspect" and its siblings. | One entry |
| `steps` | Title on its own line, then the numbered steps at full column width: a number, an `h3` title, text, and the step's own gallery under its text. | One entry for the section; steps aren't listed |
| `pricing` | Title, plan cards, the section text as a note, store button. As in the mock. | One entry |

- A gallery is one component everywhere: one image shows as is, several become a carousel, every image opens the page's single lightbox.
- `layout` is required for `text` and absent for the other kinds. A `text` row stored before this change has no layout and renders stacked.
- A `steps` section has no images of its own; Digest's "log" image moves to step 1.
- `pricing` is optional and can sit anywhere. Without one, the cards go in an automatic "Pricing" block before the FAQ.
- Hero, FAQ, closing, guides and the links row stay fixed parts of the page.

**Data model**
- `ProjectSection`: `kind ProjectSectionKind @default(text)` (`text | steps | pricing`), `layout ProjectSectionLayout?` (`stacked | split`), `items`. `hasPlans` goes; it only ever existed on this branch.
- `ProjectSectionItem` (new): `sectionId`, `title`, `description` (markdown), `sortOrder`, `images`. Generic, so a later list-shaped kind reuses it.
- `ProjectSectionItemImage` (new): `url`, `caption`, `alt`, `sortOrder`. A separate table so the legacy layout and the card and OG fallbacks keep reading section images only.
- Offers (JSON) get an optional `note`, shown with the price (Continuum's 14-day trial).

**Validation**
- `text` needs a body, takes images, no items.
- `steps` needs 2 or more items, each with a title and a body, and takes no section images; its body is an optional intro.
- `pricing` takes no images and no items; its body is the optional note.
- At most one `pricing` section, and only when the project has offers.
- An own app with offers must have plans: the import and the admin reject it otherwise. The existing offer-to-plan checks stay.

**Rendering**
- `ProductSection` switches on kind and layout.
- Galleries are keyed by section or step, not by section index, and the lightbox walks every image in page order.
- Step and item bodies render through the normal markdown processor. `rehypeNumberedSteps`, the product markdown processor and `hasNumberedSteps` go.
- "See how it works" links to the first `steps` section. The one `priority` image is the first image on the page when there's no hero image.

**Admin.** A kind picker and a layout picker per section. Steps survive a save untouched and are edited in the manifest; a step editor comes later.

**Import.** One shared image walker for section and step images, used to list, upload and keep blobs, so the prune after an import can't delete step images.

**Phases**, one commit each:
7. Data layer: schema, Zod, types, mappers, `projectInclude`, API routes, the import walker. Built, with phase 9 folded in: the API contract changed here, so the admin had to change in the same commit to keep saving.
8. Rendering: the four section shapes, galleries per section and step, the pricing section, offer notes, removing the markdown steps parser. Built; `GalleryImage` now carries a `key` unique across both image tables and a `groupIndex` (a section or a step) in place of `sectionIndex`.
9. Admin: the kind and layout pickers, items passed through. Built in phase 7.
10. Manifests: Digest converted mechanically (no copy changes). Reckon and Continuum get a content pass under the writing and SEO rules (step titles, plan features, alt text), drafted as `project.proposal.json` next to each manifest.

Not yet seen in a browser: the development database needs `db:push` (with `--accept-data-loss` for `hasPlans`) and a re-import first.

**After the code:** window crops for the step images, and a hero image without the baked-in headline (Reckon's and Continuum's hero art repeats the page's headline).

## Needs you

- `yarn db:push` against the development database, then production before the deploy. I won't run it: `prisma.config.ts` loads `.env`, which holds production credentials.
- Local visual checks need the development database to hold an own app with the new fields.

## Release order

1. Push the schema to the development database; check the pages locally.
2. Push the schema to production. Additive and nullable, so the live code, which never reads the new columns, keeps working. Production never had `hasPlans`, so revision 2 reaches it as one additive push; only the development database, pushed during the first build, asks for `--accept-data-loss` when `hasPlans` goes.
3. Re-import Reckon and Continuum from this branch, so they get their palettes.
4. Merge into `release` and deploy. The build reads the new columns, so it fails if step 2 hasn't happened.
