// The cap on every meta description the site stores, `Post.description` and
// `Guide.description`, and on what `deriveDescription` produces: 160 is where
// Google's desktop snippet truncates. The schema and the derivation share it so
// neither can accept or produce a value the other rejects.
//
// Its own dependency-free module on purpose: `schemas.ts` reaches the client
// bundle (`PostBulkImport.tsx` imports it), and importing the constant from
// `markdown.ts` would pull unified and Shiki in with it.
export const DESCRIPTION_MAX_CHARS = 160
