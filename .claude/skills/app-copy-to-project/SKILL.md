---
name: app-copy-to-project
description: >
  Map an app's marketing copy and screenshots into a structured project.json manifest (plus
  staged image files) for the roland.leth.ro projects portfolio, ready for the
  `yarn db:import-projects` script. Use this whenever the user wants to add an app to their
  site's projects/portfolio, turn finished marketing copy into a portfolio entry, or import a
  specific app like Reckon or Continuum — e.g. "add reckon to my projects", "import continuum
  as a project", "turn the marketing copy into a project", "create a portfolio entry from the
  marketing folder", "stage my app for import". Trigger this right after app-copy-generate or
  app-copy-validator when the user wants the result live on the website, even if they never say
  "manifest" or "project.json". This is the bridge from marketing artifacts to a live project
  row: it authors the manifest and stages the images, but does NOT write to the database itself
  (the import script does that). Do not use it to write marketing copy (that's app-copy-generate)
  or for unrelated database work.
---

# App Copy → Project

Turns an app's `marketing/` folder (the copy + screenshots produced by the `app-copy-*` skills)
into a `scripts/imports/<slug>/project.json` manifest plus the staged image files it references.
The `yarn db:import-projects` script then uploads the images to Vercel Blob and creates the
project on the DB.

**This skill is the editorial half** — the judgment of which copy becomes which field, which
screenshots to use, and what to ask the user for. The script is the deterministic half. Keep the
split: never write to the DB or upload from here; just produce the manifest + staged images and
hand off.

This skill is specific to **roland.leth.ro** — its project schema, enums, and import script. It
reads that contract live (Step 0) rather than hardcoding it, so it stays correct when the schema
changes.

## Prerequisites

- An app marketing folder, usually a sibling repo: `../<app>/marketing/` (e.g. `../reckon/marketing`).
  If you don't know the path, ask.
- This repo's import contract (read in Step 0). If `scripts/import-projects.ts` is missing, the
  infra isn't set up — stop and tell the user.

## Step 0 — Learn the live contract (don't hardcode it)

Before mapping anything, read these in **this** repo. The schema is the source of truth and the
manifest must satisfy it; guessing field names or limits from memory is how you ship a manifest
that fails validation at the end.

- `prisma/schema.prisma` — the `Project`, `ProjectSection`, `ProjectSectionImage`, `ProjectLink`
  models and the `PlatformBucket` / `PlatformTag` enums (the only valid values).
- `src/lib/api/schemas.ts` — `projectCreateSchema`: the field limits and the **bucket↔tag
  coherence rule** (`platformTags` must be valid for the chosen `bucket`; check
  `BUCKET_SUGGESTED_TAGS` in `src/lib/utils/platforms.ts`).
- `src/lib/import/projectImport.ts` — the `ProjectManifest` shape, and the key fact that image
  fields hold **local paths relative to the manifest folder** (the script uploads them).

Note the limits you must respect: `name` ≤ 80, `summary` ≤ 300, link `label` ≤ 60, image
`caption` ≤ 300, `platformTags` 1–8 (deduped, valid for the bucket), `accentColor` a CSS hex
(`#rgb`/`#rrggbb`/`#rgba`/`#rrggbbaa`).

## Step 1 — Locate and read the inputs

In the app's `marketing/` folder, the load-bearing files are usually:

| Source | Feeds |
|---|---|
| `copy/web/landing-page.md` | `summary`, section titles + descriptions |
| `copy/stores/app-store-*.md` | feature framing, tagline, fallback section material |
| `screenshots/<set>/` + its caption file (`copy.md` / `landing-copy.md`) | `sections[].images` + captions |
| icon / hero source image | `icon`, `heroImage` |

Folder layouts vary per app — list the folder and adapt. See `references/field-mapping.md` for the
full field-by-field mapping and judgment notes.

### Choosing the screenshot set

`screenshots/` usually holds more than one set, and they get renamed or regenerated between runs —
so list the folder and pick, don't assume a fixed name:

- **Prefer a landing / showcase set** (e.g. `screenshots/landing*/`, `*-final/`). These are usually
  landscape graphics (framed devices on a background) that also make a good 16:9 gallery hero.
- **If there's no landing set, fall back to the App Store set** (`screenshots/appstore*/`). These
  are usually portrait device frames — fine as section images, but they crop in the landscape
  gallery hero. When only a portrait set exists, set `heroImage` explicitly (to a landscape asset if
  one exists) or accept that the auto-hero (the import defaults it to the first section image) will
  be a cropped portrait.

### Sourcing the icon and accent (often missing from `marketing/`)

Marketing folders rarely include the app icon or the brand color. Don't treat these as gaps until
you've checked the app itself:

- **App icon** — if it's an Xcode project, look in
  `<app-repo>/**/Assets.xcassets/AppIcon.appiconset/` and stage the largest PNG (the 1024px
  marketing icon, usually `icon_1024.png`) as `icon`. A gallery tile with no icon looks broken, so
  it's worth the extra look before falling back.
- **Accent color** — check `<app-repo>/**/Assets.xcassets/AccentColor.colorset/Contents.json`. Its
  sRGB `components` (red/green/blue as 0–1) convert straight to a CSS hex (×255, round, to hex). The
  app's defined accent can differ from the icon's dominant color — prefer `AccentColor`, and surface
  the choice if the two clash.

If it isn't an Xcode app, or you can't find these, **ask the user for the icon's location** (and the
brand hex) rather than importing without an icon.

## Step 2 — Map copy to fields (editorial judgment)

- **summary**: one tight sentence (≤ 300), specific, no marketing filler.
- **sections**: 3–5 is the sweet spot. Each is a real feature or idea, `title` short, `description`
  a paragraph adapted from the landing/store copy. Don't pad to hit a number.
- **captions**: pull from the screenshot caption file; keep them concrete.
- Apply `~/.claude/rules/ai-tone.md` and `~/.claude/rules/marketing-copy.md` /
  `marketing-copy-quality.md` to anything you adapt. Never invent statistics — if the copy has no
  number, describe the mechanism instead.

## Step 3 — Intake the gaps (ask the user)

The marketing copy won't contain these. Ask for them — a couple at a time, most load-bearing
first. A wrong bucket or a missing store URL is worse than a question.

- **bucket** + **platformTags** (must satisfy the coherence rule from Step 0).
- **links**: ask for the **App Store app id** — the numeric id (e.g. `6762766246`) — and build the
  URL yourself as `https://apps.apple.com/app/id<id>`. A universal app's single id covers iPhone,
  iPad, and Mac on one App Store page, so one "App Store" link is usually enough. Also ask for a
  website and GitHub URL if they exist. All `links` need real `https` URLs.
- **accentColor** (hex), **date**, **role**.
- **isFeatured**, **isDiscontinued**, **sortOrder** (gallery placement — the import honours this
  verbatim, so think about where it sits relative to existing projects).

## Step 4 — Stage the images

Create `scripts/imports/<slug>/` and **copy** (never move) the chosen images from the marketing
folder into it. The marketing repo is the source of truth — don't mutate it.

- Use clear names; subfolders are fine (e.g. `sections/timeline/1.png`).
- Set each manifest image field to the **local relative path** (e.g. `./icon.png`,
  `./sections/timeline/1.png`).
- Already-hosted `https` URLs may be used as-is and are left untouched by the script.

## Step 5 — Write `project.json`

Write `scripts/imports/<slug>/project.json` (see `references/manifest-example.json`). Include an
explicit `slug`. Re-check every value against the Step 0 limits before saving — the script
validates against `projectCreateSchema`, so a length or enum violation will bounce.

## Step 6 — Report and hand off

Summarise what you did: the mapped fields, anything you assumed, and any **gaps** (missing store
URL, no hero image, a section without a screenshot). Then hand off — the script does the upload
and DB write:

```
yarn db:import-projects <slug> --dry-run   # validate manifest + images, write nothing
yarn db:import-projects <slug>             # upload to Blob + create the project
yarn db:import-projects <slug> --cleanup   # also delete the staged folder after success
```

Tell the user to run `--dry-run` first (it targets prod when run with prod credentials), and that
re-running overwrites the same project + blobs (idempotent).

## Guardrails

- **Never modify the source marketing repo.** Staging is a copy; `--cleanup` only removes the
  staging folder under `scripts/imports/`.
- **Don't hardcode the schema** — read it in Step 0 every time.
- **Image fields are local paths**, not URLs you fetch — the script uploads them.
- **Don't write to the DB or call Blob from here.** Authoring + staging only.
