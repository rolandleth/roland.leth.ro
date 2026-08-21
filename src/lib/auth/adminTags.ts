/**
 * Every admin page-body log tag, as one closed set — split out of
 * `adminMetadata.ts` so `middlewareBypass.ts` (which needs the union for
 * `requireAdminPageSession`'s `tag` parameter) doesn't have to import from a
 * module that itself imports `middlewareBypass.ts`. A hand-typed literal at a
 * call site can be copy-pasted between pages with nothing failing; a closed
 * union catches the transposition at compile time instead.
 */

/** Tag for each admin edit page — shared by `generateMetadata` (via
 * `adminEditMetadata`) and the page body (via `requireAdminPageSession`), since
 * both surfaces belong to the same page and a bypass on either should
 * attribute to the same page tag. `adminPageContract.test.ts` walks the
 * edit-page directory against this map, so a fifth page can't ship without an
 * entry. (Not `adminAuthContract.test.ts` — that file does the same job one
 * namespace over, for `/api/admin`.) */
export const ADMIN_EDIT_TAGS = {
	posts: "[admin:posts:edit]",
	projects: "[admin:projects:edit]",
	guides: "[admin:guides:edit]",
	guideTopics: "[admin:guide-topics:edit]",
} as const

export type AdminEditTag =
	(typeof ADMIN_EDIT_TAGS)[keyof typeof ADMIN_EDIT_TAGS]

/** Tag for each admin "new" page — these have no `generateMetadata` of their
 * own (a new record has no name to put in a title), so `requireAdminPageSession`
 * is their only guard. */
export const ADMIN_NEW_TAGS = {
	guides: "[admin:guides:new]",
	guideTopics: "[admin:guide-topics:new]",
} as const

export type AdminNewTag = (typeof ADMIN_NEW_TAGS)[keyof typeof ADMIN_NEW_TAGS]

/** The admin dashboard root (`/admin`) — one page, one tag. */
export const ADMIN_DASHBOARD_TAG = "[admin:dashboard]"

/** Every valid tag `requireAdminPageSession` can be called with. */
export type AdminPageTag =
	AdminEditTag | AdminNewTag | typeof ADMIN_DASHBOARD_TAG
