# Rolling History — last 30 days (through 2026-11-02)

## Themes

- **Project placement/product-page model evolved in three steps.** 10-03 replaced `isFeatured`×`isOwnApp` with independent `prominence`/`pageLayout`/`isDiscontinued`/`isOwnApp` fields; 10-11 added a `ProjectStatus` enum (`comingSoon`/`live`/`discontinued`) on top; 10-17 moved non-live status into the store-button slot; 10-19/10-20 folded four duplicated store-row implementations into one shared `StoreLinks` component and generalized legal pages into a typed `LegalPagePath` system at the same time. [source](dev-journal/2026-10-03.md), [source](dev-journal/2026-10-11.md), [source](dev-journal/2026-10-19.md)
- **Post-media (video) pipeline shipped, unverified against real Blob.** Built 10-03 (image-syntax video markdown, browser-to-Blob signed upload, importer media upload, delete-time cleanup), merged into `release` 10-05 ahead of any real Blob call; the "first real run" thread (dry run, overwrite re-run, iPhone Safari playback, admin delete) was still open as of 10-20. [source](dev-journal/2026-10-03.md), [source](dev-journal/2026-10-05.md)
- **Digest's medical-device pivot drove its site copy.** The 10-11 medical-claims review pushed Digest away from guided tests/labels toward per-symptom counts; 10-15 rebuilt its product page word-for-word from the journal-only copy; 10-17 moved its disclaimer from hero to an FAQ answer once the hero no longer made a claim to pair it with. [source](dev-journal/2026-10-11.md), [source](dev-journal/2026-10-15.md), [source](dev-journal/2026-10-17.md)
- **Legal pages generalized into a typed, sitemap-covered system.** 10-19/10-20 built `LegalPagePath`-typed dates (`LEGAL_PAGE_LAST_UPDATED`), made `LegalPageLayout` take a page `path` rather than a free string, unified every legal page's voice to "we", and added all 11 legal pages to the sitemap with `lastModified`. [source](dev-journal/2026-10-19.md), [source](dev-journal/2026-10-20.md)

## Timeline

- **2026-10-09** — More-projects preview icons became real links (no longer `aria-hidden`), with a shared-element slide between the preview row and the open list driven by one Framer `progress` MotionValue across four explicit phases; fixed a bug where discontinued projects had crowded out live ones in the preview pick. [source](dev-journal/2026-10-09.md)
