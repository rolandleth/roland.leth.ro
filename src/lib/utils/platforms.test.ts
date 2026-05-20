import { describe, expect, it } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	BUCKET_SUGGESTED_TAGS,
	bucketLabel,
	compactLabel,
	detailLabel,
	groupByBucket,
	isCompactLabelRedundant,
	tagLabel,
} from "@/lib/utils/platforms"

// #region bucketLabel + tagLabel

describe("bucketLabel", () => {
	it("renders identifier-equal labels straight through", () => {
		expect(bucketLabel(PlatformBucket.iOS)).toBe("iOS")
		expect(bucketLabel(PlatformBucket.Mac)).toBe("Mac")
		expect(bucketLabel(PlatformBucket.Web)).toBe("Web")
	})

	it("renames OpenSource → 'Open Source'", () => {
		expect(bucketLabel(PlatformBucket.OpenSource)).toBe("Open Source")
	})
})

describe("tagLabel", () => {
	it("renders identifier-equal labels straight through", () => {
		expect(tagLabel(PlatformTag.iOS)).toBe("iOS")
		expect(tagLabel(PlatformTag.Frontend)).toBe("Frontend")
	})

	it("renames MenuBar → 'Menu bar'", () => {
		expect(tagLabel(PlatformTag.MenuBar)).toBe("Menu bar")
	})

	it("renames Next → 'Next.js'", () => {
		expect(tagLabel(PlatformTag.Next)).toBe("Next.js")
	})
})

// #endregion

// #region compactLabel

describe("compactLabel", () => {
	it("falls back to the bucket label when there are no tags", () => {
		expect(compactLabel(PlatformBucket.iOS, [])).toBe("iOS")
	})

	it("renders the sole tag when there's exactly one", () => {
		expect(compactLabel(PlatformBucket.iOS, [PlatformTag.iPad])).toBe("iPad")
	})

	it("renders the tag's display label, not its identifier", () => {
		expect(compactLabel(PlatformBucket.Mac, [PlatformTag.MenuBar])).toBe(
			"Menu bar"
		)
	})

	it("returns the bucket label when all tags are within the bucket's natural set", () => {
		expect(
			compactLabel(PlatformBucket.iOS, [PlatformTag.iOS, PlatformTag.iPad])
		).toBe("iOS")
		expect(
			compactLabel(PlatformBucket.Mac, [PlatformTag.macOS, PlatformTag.MenuBar])
		).toBe("Mac")
	})

	it("returns 'Fullstack' when Web bucket has both Frontend and Backend tags", () => {
		expect(
			compactLabel(PlatformBucket.Web, [
				PlatformTag.Frontend,
				PlatformTag.Backend,
			])
		).toBe("Fullstack")
	})

	it("collapses multiple frontend-only Web tags to the bucket label (no Fullstack signal)", () => {
		// [React, Next] are both Web-natural tags, so the multi-tag case falls
		// back to the bucket label. By analogy with iOS+iPad → "iOS": when all
		// tags are in-family, the bucket label is the most honest compact value.
		expect(
			compactLabel(PlatformBucket.Web, [PlatformTag.React, PlatformTag.Next])
		).toBe("Web")
	})

	it("returns 'Multiplatform' when iOS bucket tags include Android", () => {
		// Android sits outside iOS's natural set (iOS/iPad/watchOS), so it
		// breaks the bucket-label fallback.
		expect(
			compactLabel(PlatformBucket.iOS, [PlatformTag.iOS, PlatformTag.Android])
		).toBe("Multiplatform")
	})

	it("returns 'Multiplatform' when OpenSource tags span the OSS family and a platform tag", () => {
		// OSS spans by design; the natural set is only the OSS-flavor tags, so
		// any platform tag pushes us into Multiplatform on the compact label.
		expect(
			compactLabel(PlatformBucket.OpenSource, [
				PlatformTag.Library,
				PlatformTag.iOS,
			])
		).toBe("Multiplatform")
	})

	it("returns the bucket label when all OpenSource tags are OSS-flavor", () => {
		expect(
			compactLabel(PlatformBucket.OpenSource, [
				PlatformTag.Library,
				PlatformTag.SDK,
			])
		).toBe("Open Source")
	})
})

// #endregion

// #region detailLabel

describe("detailLabel", () => {
	it("joins tags with ' + '", () => {
		expect(
			detailLabel(PlatformBucket.iOS, [
				PlatformTag.iOS,
				PlatformTag.iPad,
				PlatformTag.Android,
			])
		).toBe("iOS + iPad + Android")
	})

	it("renames tags via TAG_LABELS when rendering", () => {
		expect(
			detailLabel(PlatformBucket.Mac, [PlatformTag.macOS, PlatformTag.MenuBar])
		).toBe("macOS + Menu bar")
	})

	it("falls back to the bucket label when there are no tags", () => {
		expect(detailLabel(PlatformBucket.Web, [])).toBe("Web")
	})
})

// #endregion

// #region isCompactLabelRedundant

describe("isCompactLabelRedundant", () => {
	it("is true when the compact label equals the bucket label (single in-family tag)", () => {
		expect(isCompactLabelRedundant(PlatformBucket.iOS, [PlatformTag.iOS])).toBe(
			true
		)
	})

	it("is true when multiple in-family tags collapse to the bucket label", () => {
		expect(
			isCompactLabelRedundant(PlatformBucket.iOS, [
				PlatformTag.iOS,
				PlatformTag.iPad,
			])
		).toBe(true)
	})

	it("is false when the compact label is 'Multiplatform'", () => {
		expect(
			isCompactLabelRedundant(PlatformBucket.iOS, [
				PlatformTag.iOS,
				PlatformTag.Android,
			])
		).toBe(false)
	})

	it("is false when the compact label is 'Fullstack'", () => {
		expect(
			isCompactLabelRedundant(PlatformBucket.Web, [
				PlatformTag.Frontend,
				PlatformTag.Backend,
			])
		).toBe(false)
	})

	it("is false when the single tag's label differs from the bucket label (e.g. macOS under Mac)", () => {
		expect(
			isCompactLabelRedundant(PlatformBucket.Mac, [PlatformTag.macOS])
		).toBe(false)
	})
})

// #endregion

// #region groupByBucket

describe("groupByBucket", () => {
	it("returns an empty array for empty input", () => {
		expect(groupByBucket([])).toEqual([])
	})

	it("groups projects by their bucket field", () => {
		const projects = [
			{ bucket: PlatformBucket.iOS, name: "A" },
			{ bucket: PlatformBucket.Web, name: "B" },
			{ bucket: PlatformBucket.iOS, name: "C" },
		]
		const result = groupByBucket(projects)
		const iosGroup = result.find((g) => g.bucket === PlatformBucket.iOS)
		const webGroup = result.find((g) => g.bucket === PlatformBucket.Web)

		expect(iosGroup?.projects).toHaveLength(2)
		expect(webGroup?.projects).toHaveLength(1)
	})

	it("preserves canonical order: iOS → Mac → Web → OpenSource", () => {
		const projects = [
			{ bucket: PlatformBucket.OpenSource, name: "A" },
			{ bucket: PlatformBucket.Web, name: "B" },
			{ bucket: PlatformBucket.iOS, name: "C" },
			{ bucket: PlatformBucket.Mac, name: "D" },
		]
		const buckets = groupByBucket(projects).map((g) => g.bucket)

		expect(buckets).toEqual([
			PlatformBucket.iOS,
			PlatformBucket.Mac,
			PlatformBucket.Web,
			PlatformBucket.OpenSource,
		])
	})

	it("omits buckets that have no projects", () => {
		const projects = [{ bucket: PlatformBucket.iOS, name: "A" }]
		const buckets = groupByBucket(projects).map((g) => g.bucket)

		expect(buckets).toEqual([PlatformBucket.iOS])
	})

	it("includes the display label alongside the bucket discriminant", () => {
		const projects = [{ bucket: PlatformBucket.OpenSource, name: "A" }]
		const [group] = groupByBucket(projects)

		expect(group.label).toBe("Open Source")
	})
})

// #endregion

// #region BUCKET_SUGGESTED_TAGS

describe("BUCKET_SUGGESTED_TAGS", () => {
	it("scopes iOS/Mac/Web suggestions to their natural tag sets", () => {
		expect(BUCKET_SUGGESTED_TAGS[PlatformBucket.iOS]).not.toContain(
			PlatformTag.Frontend
		)
		expect(BUCKET_SUGGESTED_TAGS[PlatformBucket.Mac]).not.toContain(
			PlatformTag.Android
		)
		expect(BUCKET_SUGGESTED_TAGS[PlatformBucket.Web]).not.toContain(
			PlatformTag.iOS
		)
	})

	it("surfaces every tag for OpenSource (an OSS lib can also have platform tags)", () => {
		expect(BUCKET_SUGGESTED_TAGS[PlatformBucket.OpenSource]).toContain(
			PlatformTag.iOS
		)
		expect(BUCKET_SUGGESTED_TAGS[PlatformBucket.OpenSource]).toContain(
			PlatformTag.Frontend
		)
		expect(BUCKET_SUGGESTED_TAGS[PlatformBucket.OpenSource]).toContain(
			PlatformTag.Library
		)
	})
})

// #endregion
