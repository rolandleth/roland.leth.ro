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
		sortOrder: 1,
		readingTime: "1 min read",
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
