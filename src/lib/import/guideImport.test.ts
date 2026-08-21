import { describe, expect, it } from "vitest"
import {
	type ExistingGuide,
	type ExistingTopic,
	type GuideSourceFile,
	parseGuideFiles,
	planGuideImport,
	UNCHANGED_SKIP_REASON,
} from "@/lib/import/guideImport"

function topicFile(overrides: Partial<GuideSourceFile> = {}): GuideSourceFile {
	return {
		relativePath: "making-better-decisions/index.md",
		filename: "index.md",
		topicFolder: "making-better-decisions",
		isTopicFile: true,
		content: `---
slug: making-better-decisions
title: Making better decisions
shortDescription: A method for judging your own calls honestly.
project: reckon
---

Hub body.
`,
		...overrides,
	}
}

function guideFile(overrides: Partial<GuideSourceFile> = {}): GuideSourceFile {
	return {
		relativePath: "making-better-decisions/2026-07-17-How to keep one.md",
		filename: "2026-07-17-How to keep one.md",
		topicFolder: "making-better-decisions",
		isTopicFile: false,
		content: `---
slug: how-to-keep-a-decision-journal
title: How to keep a decision journal
description: What to write down before an outcome exists, and why.
sortOrder: 1
---

Guide body.
`,
		...overrides,
	}
}

function rootGuideFile(
	overrides: Partial<GuideSourceFile> = {}
): GuideSourceFile {
	return {
		relativePath: "2026-07-17-How calibrated are you.md",
		filename: "2026-07-17-How calibrated are you.md",
		topicFolder: null,
		isTopicFile: false,
		content: `---
slug: how-calibrated-are-you
title: How calibrated are you
description: A self-test for overconfidence.
project: reckon
---

Standalone body.
`,
		...overrides,
	}
}

// #region parseGuideFiles — project-link warning

describe("parseGuideFiles — project-link warning", () => {
	const withLink = (body: string) => `---
slug: how-calibrated-are-you
title: How calibrated are you
description: A self-test for overconfidence.
project: reckon
---

${body}
`

	it("warns when a guide names a project its body never links to", () => {
		const { guides, warnings } = parseGuideFiles([
			rootGuideFile({ content: withLink("No link in here.") }),
		])

		// A warning, never a skip — the page is still fine.
		expect(guides).toHaveLength(1)
		expect(warnings).toHaveLength(1)
		expect(warnings[0].message).toContain("/projects/reckon")
	})

	it.each([
		["an inline link", "I make [Reckon](/projects/reckon), an app."],
		// The four real guides use reference definitions, not inline links.
		[
			"a reference definition",
			'I make [Reckon][reckon].\n\n[reckon]: /projects/reckon "Reckon"',
		],
		[
			"a link followed by punctuation or a closing paren",
			"See [Reckon](/projects/reckon), it's an app.",
		],
	])("stays quiet when the body carries %s", (_label, body) => {
		const { warnings } = parseGuideFiles([
			rootGuideFile({ content: withLink(body) }),
		])

		expect(warnings).toEqual([])
	})

	// A path shown as a code example is not a real link — the warning must still
	// fire so the maker knows the guide doesn't actually link the product.
	it.each([
		["is inside a fenced code block", "```\nGET /projects/reckon\n```"],
		["is inline code", "The route is `/projects/reckon`."],
		// `/projects/reckon` must not match inside a longer sibling slug.
		[
			"is a link to a different project whose slug shares a prefix",
			"See [Reckon Pro](/projects/reckon-pro).",
		],
	])("still warns when the only mention %s", (_label, body) => {
		const { warnings } = parseGuideFiles([
			rootGuideFile({ content: withLink(body) }),
		])

		expect(warnings).toHaveLength(1)
	})

	it("warns on a topic hub whose body never links to its project", () => {
		const { warnings } = parseGuideFiles([topicFile()])

		expect(warnings).toHaveLength(1)
		expect(warnings[0].relativePath).toBe("making-better-decisions/index.md")
	})

	it("warns on a grouped guide, which inherits its project from the topic", () => {
		const { warnings } = parseGuideFiles([
			topicFile({
				content: `---
slug: making-better-decisions
title: Making better decisions
shortDescription: A method.
project: reckon
---

Hub body linking to [Reckon](/projects/reckon).
`,
			}),
			guideFile(),
		])

		expect(warnings).toHaveLength(1)
		expect(warnings[0].relativePath).toBe(
			"making-better-decisions/2026-07-17-How to keep one.md"
		)
	})

	it("never warns for a page that names no project", () => {
		const { warnings } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: how-calibrated-are-you
title: How calibrated are you
description: A self-test for overconfidence.
---

No project, no link, no warning.
`,
			}),
		])

		expect(warnings).toEqual([])
	})
})

// #endregion

// #region parseGuideFiles — topics

describe("parseGuideFiles — topics", () => {
	it("parses a topic from its index.md frontmatter and body", () => {
		const { topics, skipped } = parseGuideFiles([topicFile()])

		expect(skipped).toEqual([])
		expect(topics[0]).toMatchObject({
			slug: "making-better-decisions",
			title: "Making better decisions",
			shortDescription: "A method for judging your own calls honestly.",
			projectSlug: "reckon",
			description: "Hub body.\n",
			folder: "making-better-decisions",
		})
	})

	// The directory name is decorative; the frontmatter slug is the URL.
	it("takes the slug from frontmatter, not the folder name", () => {
		const { topics } = parseGuideFiles([
			topicFile({
				relativePath: "some-folder/index.md",
				topicFolder: "some-folder",
			}),
		])

		expect(topics[0].slug).toBe("making-better-decisions")
		expect(topics[0].folder).toBe("some-folder")
	})

	it("allows a topic with no project", () => {
		const { topics, skipped } = parseGuideFiles([
			topicFile({
				content: `---
slug: t
title: T
shortDescription: S
---

Body.
`,
			}),
		])

		expect(skipped).toEqual([])
		expect(topics[0].projectSlug).toBeNull()
	})

	it("skips a topic missing its shortDescription", () => {
		const { topics, skipped } = parseGuideFiles([
			topicFile({
				content: `---
slug: t
title: T
---

Body.
`,
			}),
		])

		expect(topics).toEqual([])
		expect(skipped[0].reason).toContain("shortDescription")
	})

	it("skips a topic with an empty hub body", () => {
		const { skipped } = parseGuideFiles([
			topicFile({
				content: `---
slug: t
title: T
shortDescription: S
---
`,
			}),
		])

		expect(skipped[0].reason).toContain("description")
	})
})

// #endregion

// #region parseGuideFiles — guides

describe("parseGuideFiles — guides", () => {
	it("parses a grouped guide and inherits its topic's project", () => {
		const { guides, skipped } = parseGuideFiles([topicFile(), guideFile()])

		expect(skipped).toEqual([])
		expect(guides[0]).toMatchObject({
			slug: "how-to-keep-a-decision-journal",
			title: "How to keep a decision journal",
			projectSlug: "reckon",
			topicFolder: "making-better-decisions",
			sortOrder: 1,
		})
	})

	it("derives reading time from the body", () => {
		const { guides } = parseGuideFiles([
			topicFile(),
			guideFile({
				content: `---
slug: g
title: G
description: D
---

${"word ".repeat(500)}
`,
			}),
		])

		expect(guides[0].readingTime).toMatch(/min read/)
	})

	it("parses an ungrouped guide with its own project", () => {
		const { guides } = parseGuideFiles([rootGuideFile()])

		expect(guides[0]).toMatchObject({
			slug: "how-calibrated-are-you",
			projectSlug: "reckon",
			topicFolder: null,
		})
	})

	it("allows an ungrouped guide with no project", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: g
title: G
description: D
---

Body.
`,
			}),
		])

		expect(skipped).toEqual([])
		expect(guides[0].projectSlug).toBeNull()
	})

	it("defaults sortOrder to 0 when absent", () => {
		const { guides } = parseGuideFiles([rootGuideFile()])

		expect(guides[0].sortOrder).toBe(0)
	})

	// Authored, not stamped at import time: otherwise the date depends on when
	// the import ran, and a re-import into a fresh DB re-ages every guide.
	it("reads publishedAt from the filename's date prefix, at UTC midnight", () => {
		const { guides } = parseGuideFiles([
			rootGuideFile({ filename: "2026-07-13-How calibrated are you.md" }),
		])

		expect(guides[0].publishedAt.toISOString()).toBe("2026-07-13T00:00:00.000Z")
	})

	it("reads an optional HHmm from the filename", () => {
		const { guides } = parseGuideFiles([
			rootGuideFile({ filename: "2026-07-13-0930-How calibrated are you.md" }),
		])

		expect(guides[0].publishedAt.toISOString()).toBe("2026-07-13T09:30:00.000Z")
	})

	it("skips a guide whose filename carries no date", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({ filename: "How calibrated are you.md" }),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("yyyy-MM-dd")
	})

	it("skips a filename whose date isn't on the calendar", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({ filename: "2026-02-31-How calibrated are you.md" }),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("Invalid date")
	})

	it("skips a filename with an out-of-range time", () => {
		const { skipped } = parseGuideFiles([
			rootGuideFile({ filename: "2026-07-13-2599-How calibrated are you.md" }),
		])

		expect(skipped[0].reason).toContain("Invalid time")
	})

	// A topic has no publication date of its own, so `index.md` needs no prefix.
	it("does not require a date on a topic's index.md", () => {
		const { topics, skipped } = parseGuideFiles([topicFile()])

		expect(skipped).toEqual([])
		expect(topics).toHaveLength(1)
	})

	// A grouped guide's project is fully determined by its topic; declaring it
	// again can only drift, and the DB would reject the mismatch anyway.
	it("rejects `project:` on a grouped guide rather than letting it contradict the topic", () => {
		const { guides, skipped } = parseGuideFiles([
			topicFile(),
			guideFile({
				content: `---
slug: g
title: G
description: D
project: continuum
---

Body.
`,
			}),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("Unknown frontmatter key `project`")
	})

	// Importing it ungrouped would put it on the wrong pages.
	it("skips a guide whose folder has no importable index.md", () => {
		const { guides, skipped } = parseGuideFiles([guideFile()])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain(`no importable \`index.md\``)
	})

	it("skips every guide in a folder whose topic failed to parse", () => {
		const { guides, skipped } = parseGuideFiles([
			topicFile({ content: "no frontmatter at all" }),
			guideFile(),
		])

		expect(guides).toEqual([])
		expect(skipped).toHaveLength(2)
	})
})

// #endregion

// #region parseGuideFiles — validation

describe("parseGuideFiles — validation", () => {
	it("skips a guide with no slug — it is authored, never derived from the title", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
title: G
description: D
---

Body.
`,
			}),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("slug")
	})

	it("skips a non-canonical slug rather than normalizing it", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: How To Keep One
title: G
description: D
---

Body.
`,
			}),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("slug")
	})

	it("skips a description over the 160-char cap", () => {
		const { skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: g
title: G
description: ${"d".repeat(161)}
---

Body.
`,
			}),
		])

		expect(skipped[0].reason).toContain("description")
	})

	it("skips a non-integer sortOrder loudly rather than coercing it to 0", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: g
title: G
description: D
sortOrder: 1.5
---

Body.
`,
			}),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("sortOrder")
	})

	it("skips a negative sortOrder", () => {
		const { skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: g
title: G
description: D
sortOrder: -1
---

Body.
`,
			}),
		])

		expect(skipped[0].reason).toContain("sortOrder")
	})

	// Above Postgres INT4 max it would fail opaquely at insert; reject at parse.
	it("skips a sortOrder that exceeds the Postgres integer range", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: g
title: G
description: D
sortOrder: 9999999999
---

Body.
`,
			}),
		])

		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("sortOrder")
	})

	it("skips a guide with an empty body", () => {
		const { skipped } = parseGuideFiles([
			rootGuideFile({
				content: `---
slug: g
title: G
description: D
---
`,
			}),
		])

		expect(skipped[0].reason).toContain("body")
	})
})

// #endregion

// #region parseGuideFiles — slug collisions

describe("parseGuideFiles — slug collisions", () => {
	it("skips a second file claiming a slug already taken in the batch", () => {
		const { guides, skipped } = parseGuideFiles([
			rootGuideFile({ relativePath: "a.md" }),
			rootGuideFile({ relativePath: "b.md" }),
		])

		expect(guides).toHaveLength(1)
		expect(skipped[0].relativePath).toBe("b.md")
		expect(skipped[0].reason).toContain("already used by a.md")
	})

	// Guides and topics share one flat namespace across two tables, so the
	// collision check has to span both kinds.
	it("skips a guide whose slug collides with a topic in the same batch", () => {
		const { guides, topics, skipped } = parseGuideFiles([
			topicFile(),
			rootGuideFile({
				relativePath: "clash.md",
				content: `---
slug: making-better-decisions
title: G
description: D
---

Body.
`,
			}),
		])

		expect(topics).toHaveLength(1)
		expect(guides).toEqual([])
		expect(skipped[0].reason).toContain("already used by")
	})
})

// #endregion

// #region planGuideImport

describe("planGuideImport", () => {
	const parsed = parseGuideFiles([topicFile(), guideFile()])

	function plan(
		existing: {
			topicsBySlug?: Map<string, ExistingTopic>
			guidesBySlug?: Map<string, ExistingGuide>
		} = {},
		overwrite = false
	) {
		return planGuideImport(
			parsed,
			{
				topicsBySlug: existing.topicsBySlug ?? new Map(),
				guidesBySlug: existing.guidesBySlug ?? new Map(),
			},
			{ overwrite }
		)
	}

	const existingTopic: ExistingTopic = {
		id: 1,
		title: "Making better decisions",
		shortDescription: "A method for judging your own calls honestly.",
		description: "Hub body.\n",
		projectSlug: "reckon",
	}

	const existingGuide: ExistingGuide = {
		id: 2,
		title: "How to keep a decision journal",
		description: "What to write down before an outcome exists, and why.",
		body: "Guide body.\n",
		projectSlug: "reckon",
		topicId: 1,
		topicSlug: "making-better-decisions",
		sortOrder: 1,
		readingTime: "1 min read",
		// Matches `guideFile`'s `2026-07-17-` prefix, so the default fixture is
		// genuinely unchanged and the idempotency test means something.
		publishedAt: new Date("2026-07-17T00:00:00.000Z"),
	}

	it("plans creates for unknown slugs", () => {
		const result = plan()

		expect(result.topicCreates).toHaveLength(1)
		expect(result.guideCreates).toHaveLength(1)
		expect(result.skipped).toEqual([])
	})

	it("carries the folder through so the shell can resolve a topicId", () => {
		expect(plan().guideCreates[0].topicFolder).toBe("making-better-decisions")
	})

	it("skips an existing slug without --overwrite", () => {
		const result = plan({
			topicsBySlug: new Map([["making-better-decisions", existingTopic]]),
		})

		expect(result.topicCreates).toEqual([])
		expect(result.skipped[0].reason).toContain("--overwrite")
	})

	it("plans no writes for an unchanged folder on a re-run", () => {
		const result = plan(
			{
				topicsBySlug: new Map([["making-better-decisions", existingTopic]]),
				guidesBySlug: new Map([
					["how-to-keep-a-decision-journal", existingGuide],
				]),
			},
			true
		)

		expect(result.topicUpdates).toEqual([])
		expect(result.guideUpdates).toEqual([])
		expect(
			result.skipped.every((skip) => skip.reason === UNCHANGED_SKIP_REASON)
		).toBe(true)
	})

	it("plans an update carrying only the changed fields", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, title: "Old title" },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].data).toEqual({
			title: "How to keep a decision journal",
		})
	})

	// The shell resolves `topicFolder` → `topicId`, so an update must carry the
	// file's current folder for a moved-and-edited guide to re-group.
	it("carries the current topicFolder on an update so a moved guide re-groups", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, title: "Old title", topicId: 99 },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].topicFolder).toBe("making-better-decisions")
	})

	// A pure move (folder changed, content byte-identical) must still update, or
	// the guide keeps its old topicId — the row's current topic slug differs from
	// the file's folder-resolved target, so it's not "unchanged".
	it("plans an update for a pure folder move even when content is unchanged", () => {
		const result = plan(
			{
				topicsBySlug: new Map([["making-better-decisions", existingTopic]]),
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, topicSlug: "some-other-topic" },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates).toHaveLength(1)
		expect(result.guideUpdates[0].data).toEqual({})
		expect(result.guideUpdates[0].topicFolder).toBe("making-better-decisions")
	})

	it("carries the filename's publishedAt onto a create", () => {
		expect(plan().guideCreates[0].publishedAt.toISOString()).toBe(
			"2026-07-17T00:00:00.000Z"
		)
	})

	// The filename owns the date, so renaming a file to a different one means it.
	it("re-syncs publishedAt when the filename's date changes", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{
							...existingGuide,
							publishedAt: new Date("2026-01-01T00:00:00.000Z"),
						},
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].data.publishedAt?.toISOString()).toBe(
			"2026-07-17T00:00:00.000Z"
		)
	})

	it("backfills publishedAt on a row that never had one", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, publishedAt: null },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].data.publishedAt?.toISOString()).toBe(
			"2026-07-17T00:00:00.000Z"
		)
	})

	it("leaves publishedAt alone when the filename's date is unchanged", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, title: "Old title" },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].data).not.toHaveProperty("publishedAt")
	})

	it("recomputes reading time when the body changes", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, body: "Different.", readingTime: "9 min read" },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].data.body).toBe("Guide body.\n")
		expect(result.guideUpdates[0].data.readingTime).not.toBe("9 min read")
	})

	// Re-importing an edited file must not republish something staged.
	it("never plans a `published` change", () => {
		const result = plan(
			{
				guidesBySlug: new Map([
					[
						"how-to-keep-a-decision-journal",
						{ ...existingGuide, title: "Old" },
					],
				]),
			},
			true
		)

		expect(result.guideUpdates[0].data).not.toHaveProperty("published")
	})

	it("plans a topic update when its hub body changes", () => {
		const result = plan(
			{
				topicsBySlug: new Map([
					[
						"making-better-decisions",
						{ ...existingTopic, description: "Old body.\n" },
					],
				]),
			},
			true
		)

		expect(result.topicUpdates[0].data).toEqual({ description: "Hub body.\n" })
	})
})

// #endregion
