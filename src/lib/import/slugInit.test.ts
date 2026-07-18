import { describe, expect, it } from "vitest"
import { buildPostFile, setFrontmatterSlug } from "./frontmatter"
import { groupBy, matchRow, planStamp, type Row } from "./slugInit"

const DT = "2026-07-24-0937"

function row(slug: string, title: string, datetime: string): Row {
	return { slug, title, datetime }
}

function maps(rows: Row[]) {
	return {
		byDatetime: groupBy(rows, "datetime"),
		byTitle: groupBy(rows, "title"),
	}
}

/** A file with a title and no `slug:` line, named for the given datetime. */
function file(
	datetime: string,
	title: string
): { filename: string; content: string } {
	return {
		filename: `${datetime}-any-label.md`,
		content: buildPostFile(title, "Body."),
	}
}

// #region matchRow

describe("matchRow", () => {
	it("binds the single datetime match", () => {
		const rows = [row("a", "A", DT)]
		const { byDatetime, byTitle } = maps(rows)

		expect(matchRow(byDatetime.get(DT), byTitle.get("A"), DT)).toEqual(rows[0])
	})

	it("disambiguates a same-minute collision by title", () => {
		const rows = [row("a", "A", DT), row("b", "B", DT)]
		const { byDatetime, byTitle } = maps(rows)

		// Two rows share the datetime, so the title picks the right one — and it
		// sits at the file's datetime, so it's a safe bind.
		expect(matchRow(byDatetime.get(DT), byTitle.get("B"), DT)).toEqual(rows[1])
	})

	it("refuses a title match at a different datetime", () => {
		const rows = [row("old", "Reused", "2020-01-01-0000")]
		const { byDatetime, byTitle } = maps(rows)

		// No row at the file's datetime; the only title hit is a different post —
		// re-date vs. title-reuse is indistinguishable, so don't guess.
		expect(matchRow(byDatetime.get(DT), byTitle.get("Reused"), DT)).toBeNull()
	})

	it("returns null when nothing matches", () => {
		expect(matchRow(undefined, undefined, DT)).toBeNull()
	})

	it("returns null when both keys are ambiguous", () => {
		const rows = [row("a", "Same", DT), row("b", "Same", DT)]
		const { byDatetime, byTitle } = maps(rows)

		expect(matchRow(byDatetime.get(DT), byTitle.get("Same"), DT)).toBeNull()
	})

	// Compound guard: the file's datetime has MULTIPLE rows (so no datetime bind),
	// and the sole title hit sits at a different datetime. A refactor that loosened
	// the title fallback to "any title hit when datetime is ambiguous" would bind
	// the wrong row here — pin that it stays null.
	it("refuses a title match elsewhere when the file's datetime is ambiguous", () => {
		const rows = [
			row("a", "A", DT),
			row("b", "B", DT),
			row("loner", "Loner", "2020-01-01-0000"),
		]
		const { byDatetime, byTitle } = maps(rows)

		expect(matchRow(byDatetime.get(DT), byTitle.get("Loner"), DT)).toBeNull()
	})
})

// #endregion

// #region planStamp

describe("planStamp", () => {
	it("problems on an unparseable filename", () => {
		const { byDatetime, byTitle } = maps([])
		const plan = planStamp(
			"notes.txt",
			buildPostFile("A", "Body."),
			byDatetime,
			byTitle
		)

		expect(plan.kind).toBe("problem")
	})

	it("problems on a file with no frontmatter title", () => {
		const { byDatetime, byTitle } = maps([row("a", "A", DT)])
		const plan = planStamp(
			`${DT}-a.md`,
			"No frontmatter, just body.",
			byDatetime,
			byTitle
		)

		expect(plan).toMatchObject({
			kind: "problem",
			message: expect.stringContaining("missing `title:`"),
		})
	})

	it("problems with an unambiguous-match message when nothing matches", () => {
		const { byDatetime, byTitle } = maps([row("a", "Other", "2020-01-01-0000")])
		const { filename, content } = file(DT, "A")
		const plan = planStamp(filename, content, byDatetime, byTitle)

		expect(plan).toMatchObject({
			kind: "problem",
			message: expect.stringContaining("no unambiguous DB match"),
		})
	})

	it("problems when the only title match sits at another datetime", () => {
		const { byDatetime, byTitle } = maps([
			row("old", "Reused", "2020-01-01-0000"),
		])
		const { filename, content } = file(DT, "Reused")
		const plan = planStamp(filename, content, byDatetime, byTitle)

		// The corruption guard: a new file reusing an old title is left untouched.
		expect(plan.kind).toBe("problem")
	})

	it("reports unchanged when the file is already canonical", () => {
		const { byDatetime, byTitle } = maps([row("a-slug", "A", DT)])
		const content = setFrontmatterSlug(buildPostFile("A", "Body."), "a-slug")
		const plan = planStamp(`${DT}-a.md`, content, byDatetime, byTitle)

		expect(plan).toEqual({ kind: "unchanged", slug: "a-slug" })
	})

	it("plans a write with the row's slug for a file with no slug line", () => {
		const { byDatetime, byTitle } = maps([row("real-slug", "A", DT)])
		const { filename, content } = file(DT, "A")
		const plan = planStamp(filename, content, byDatetime, byTitle)

		expect(plan).toMatchObject({
			kind: "write",
			slug: "real-slug",
			change: "slug: real-slug",
			titleDiffers: false,
		})
	})

	it("heals a non-canonical slug even though it parses to the row's value", () => {
		const { byDatetime, byTitle } = maps([row("a-slug", "A", DT)])
		// Quoted value parses to `a-slug` but isn't byte-canonical on disk.
		const content = `---\ntitle: "A"\nslug: "a-slug"\n---\n\nBody.`
		const plan = planStamp(`${DT}-a.md`, content, byDatetime, byTitle)

		expect(plan).toMatchObject({ kind: "write", slug: "a-slug" })
	})

	it("flags a datetime match whose DB title differs", () => {
		const { byDatetime, byTitle } = maps([row("real-slug", "DB title", DT)])
		const { filename, content } = file(DT, "File title")
		const plan = planStamp(filename, content, byDatetime, byTitle)

		expect(plan).toMatchObject({
			kind: "write",
			slug: "real-slug",
			titleDiffers: true,
		})
	})
})

// #endregion
