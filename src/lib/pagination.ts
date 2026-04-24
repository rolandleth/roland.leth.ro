// Shared page size for all paginated admin and public list views. Owned here
// (rather than under a specific domain like `posts`) so projects, posts, and
// any future paginated resource can reference the same value without one
// domain implicitly pulling another into its dependency graph.
export const PAGE_SIZE = 10
