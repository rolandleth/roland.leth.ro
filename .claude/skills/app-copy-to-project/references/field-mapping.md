# Field mapping reference

How each `project.json` field is sourced and the judgment that goes into it. The authoritative
limits live in `src/lib/api/schemas.ts` (`projectCreateSchema`) — read that in Step 0; the values
here are a guide, not a substitute.

## Field-by-field

| Manifest field | Source | Notes / limits |
|---|---|---|
| `name` | App name | ≤ 80. Exact product name, consistent casing. |
| `slug` | Derived from name, or set explicitly | Lowercase, hyphenated. Set it explicitly for stability (URLs depend on it). |
| `summary` | `copy/web/landing-page.md` hero / first paragraph | ≤ 300. One tight, specific sentence. Strip marketing filler. **Also the `<meta description>`** — front-load the app's category + primary search term in the first ~155 chars (what Google renders), without breaking voice. |
| `metaTitle` | **Authored** (SEO — not in marketing copy) | ≤ 60. Drives the `<title>` tag (falls back to `name`). Keyword-first, since the brand name is unknown to searchers: what the app *is* + platform, e.g. "Decision journal & calibration tracker for iPhone". `name` still drives the `<h1>` and gallery card. See "SEO & structured-data fields" below. |
| `keywords` | **Authored** (SEO) | Array, ≤ 10 strings each ≤ 50. The realistic search queries for the app's category. Low Google value (the keywords meta is ignored) — keep it to ~5, don't over-invest. |
| `icon` | App icon image (see asset note) | Local path (e.g. `./icon.png`) or `null`. For an Xcode app, pull the largest PNG from `<app-repo>/**/Assets.xcassets/AppIcon.appiconset/`; otherwise ask the user for its location. |
| `cardImage` | Card image | Local path or `null`. The gallery/list card. Card resolution is `cardImage ?? ogImage ?? heroImage ?? first section image` (`resolveCardImage`). Prefer a dedicated card asset; if none, an OG image (landscape, ~1200×630) reads well as a tile. Leave `null` rather than forcing a portrait screenshot in. |
| `ogImage` | OG / social-share image | Local path or `null`. The project page's social/OG card, resolving `ogImage ?? cardImage ?? heroImage ?? first section image`. Stage a dedicated OG asset (~1200×630, landscape) when one exists; otherwise leave `null` and let it fall back to `cardImage`. Don't duplicate the same file into both `cardImage` and `ogImage` — fill one and let the other fall back. |
| `heroImage` | Hero / banner image | Local path or `null`. Optional — omit if there's no good asset. |
| `bucket` | **Ask the user** | One of `PlatformBucket` (iOS / Mac / Web / OpenSource). Editorial home; drives gallery grouping. |
| `platformTags` | **Ask the user** | 1–8 of `PlatformTag`, deduped, **valid for the bucket** (coherence rule below). The honest stack. |
| `role` | Brief / user | ≤ 80. e.g. "Sole developer". |
| `accentColor` | Brand color — `AccentColor.colorset`, else **ask** | CSS hex (`#rgb` / `#rrggbb` / `#rgba` / `#rrggbbaa`). For an Xcode app, read `<app-repo>/**/Assets.xcassets/AccentColor.colorset/Contents.json` (sRGB components ×255 → hex). |
| `isFeatured` | **Ask** | Whether it's pinned/highlighted in the gallery. |
| `isDiscontinued` | **Ask** | Discontinued projects sort last on public surfaces. |
| `date` | Brief / **ask** | Free-form string (e.g. "2024"). |
| `sortOrder` | **Ask** | Integer ≥ 0. The import honours it verbatim — consider existing projects' order. |
| `sections[].title` | `copy/web/landing-page.md` section headings, `copy/stores/*` features | ≤ 200. A real feature or idea. |
| `sections[].description` | The matching landing/store paragraph, adapted | ≤ 100,000 but keep it a paragraph. Apply the tone rules. |
| `sections[].sortOrder` | Order of appearance | Integer ≥ 0. |
| `sections[].images[].url` | `screenshots/<set>/*.png` | Local path. Prefer a landing/showcase set; fall back to the App Store set if there's no landing one (see "Choosing the screenshot set" in SKILL.md). Pick the screenshots that illustrate the section. |
| `sections[].images[].caption` | Screenshot caption file (`copy.md` / `landing-copy.md`) | ≤ 300, or `null`. Concrete, not decorative. |
| `links[].label` | **Ask** | ≤ 60. e.g. "App Store", "GitHub", "Website". |
| `links[].url` | **Ask** (App Store: app id) | Real `https` URL. For the App Store, ask for the numeric **app id** and build `https://apps.apple.com/app/id<id>` (one id covers iPhone/iPad/Mac). Get website/GitHub URLs from the user. |
| `offers` | **Ask** (pricing — not in marketing copy) | Optional array of `{ name, price, priceCurrency, billingPeriod?, sortOrder? }`. Feeds the `SoftwareApplication` JSON-LD price (app buckets only). `price` is a **plain decimal string** — digits with optional 1–2 decimals (`"0"`, `"4.99"`, `"249.00"`), no currency symbol or words (the schema rejects `"Free"`, `"$4"`). `priceCurrency` a 3-letter ISO code (default **USD** for consistency with existing projects). **Free** app → one entry priced `"0"` (don't omit `offers` — an absent array means *price unknown*, not free). One-time → a single entry, no `billingPeriod`; subscription → one entry per plan with an ISO-8601 `billingPeriod` (`P1M`, `P1Y`). The builder renders one entry as a single `Offer` and two-plus as an `AggregateOffer` (low–high), so paid-upfront, free, and multi-plan apps all come out right from the same array. |
| `applicationCategory` | **Authored** (app buckets only) | ≤ 60. schema.org `applicationCategory` for the `SoftwareApplication` JSON-LD — e.g. `BusinessApplication`, `ProductivityApplication`, `GameApplication`, `EducationApplication`, `UtilitiesApplication`. Pick the closest value; omitted from the JSON-LD when unset, so leave it out rather than guess. |
| `faqs` | **Authored** (SEO — the highest-leverage AI-citation asset) | Optional array of `{ question, answer, sortOrder? }`. 4–6 self-contained Q&As; each `answer` ~40–60 words and readable out of context (ChatGPT/Perplexity extract them). Cover: what it is, how it differs from the obvious alternative, the key concept/term, privacy/data, and pricing. Plain-language questions matching real queries. Apply the tone rules. |

## Bucket ↔ tag coherence

`projectCreateSchema` rejects a project whose `platformTags` aren't valid for its `bucket`
(`refineBucketTagCoherence`). The allowed sets come from `BUCKET_SUGGESTED_TAGS` in
`src/lib/utils/platforms.ts` — read it. `OpenSource` accepts any tag; `iOS` / `Mac` / `Web` are
scoped to their natural sets. If the user picks an incoherent combo, surface it and reconcile
before writing the manifest, not after the script bounces it.

## Intake checklist (Step 3)

These aren't in the marketing copy. Ask, a couple at a time:

1. `bucket` + `platformTags`
2. App Store **app id** (build `https://apps.apple.com/app/id<id>`), plus website / GitHub URLs
3. `accentColor`, `date`, `role`
4. `isFeatured`, `isDiscontinued`, `sortOrder`
5. **Pricing** → `offers` (free / one-time + amount / subscription plans). Default currency **USD**.

## SEO & structured-data fields

`metaTitle`, `keywords`, and `faqs` don't come from the marketing copy — they're **authored** for
search and AI-answer-engine discoverability, which is the primary acquisition channel for App Store
apps the stores barely surface. Author them with the same judgment the `seo-audit` / `ai-seo` skills
encode (and the tone rules below):

- **`metaTitle`** — the single biggest lever. The `<title>` defaults to `name` ("Continuum"), a brand
  word nobody searches. Replace it with a keyword-first descriptor of what the app is + platform.
  `name` still drives the `<h1>` and gallery card, so the page stays clean.
- **`faqs`** — the highest-leverage AI-citation block: self-contained Q&As are what ChatGPT /
  Perplexity extract. Derive them from *this* app's product and search queries — never template-stamp
  another app's questions. (Note: Google restricts FAQ *rich results* to gov/health sites, so the
  payoff here is AI citation + valid structured data, not a Google snippet.)
- **`offers`** — feeds the `SoftwareApplication` JSON-LD price (app buckets only). Ask for it (Step 3).
- **`applicationCategory`** — the schema.org category for that same JSON-LD (app buckets only). Pick the
  closest schema.org value (`BusinessApplication`, `ProductivityApplication`, `GameApplication`,
  `EducationApplication`, `UtilitiesApplication`, …); it's omitted from the JSON-LD when unset, so leave
  it out rather than guess if you're genuinely unsure.

## Tone rules

Apply to any copy you adapt (summary, section descriptions, captions):

- `~/.claude/rules/ai-tone.md` — universal AI-tell avoidance.
- `~/.claude/rules/marketing-copy.md` + `marketing-copy-quality.md` — marketing banlist and
  quality rules.

Never invent statistics. If the brief/copy has no number, describe the mechanism instead.
