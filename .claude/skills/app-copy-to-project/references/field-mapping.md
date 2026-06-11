# Field mapping reference

How each `project.json` field is sourced and the judgment that goes into it. The authoritative
limits live in `src/lib/api/schemas.ts` (`projectCreateSchema`) — read that in Step 0; the values
here are a guide, not a substitute.

## Field-by-field

| Manifest field | Source | Notes / limits |
|---|---|---|
| `name` | App name | ≤ 80. Exact product name, consistent casing. |
| `slug` | Derived from name, or set explicitly | Lowercase, hyphenated. Set it explicitly for stability (URLs depend on it). |
| `summary` | `copy/web/landing-page.md` hero / first paragraph | ≤ 300. One tight, specific sentence. Strip marketing filler. |
| `icon` | App icon image (see asset note) | Local path (e.g. `./icon.png`) or `null`. For an Xcode app, pull the largest PNG from `<app-repo>/**/Assets.xcassets/AppIcon.appiconset/`; otherwise ask the user for its location. |
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

## Tone rules

Apply to any copy you adapt (summary, section descriptions, captions):

- `~/.claude/rules/ai-tone.md` — universal AI-tell avoidance.
- `~/.claude/rules/marketing-copy.md` + `marketing-copy-quality.md` — marketing banlist and
  quality rules.

Never invent statistics. If the brief/copy has no number, describe the mechanism instead.
