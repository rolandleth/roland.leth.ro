import { describe, expect, it } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import {
	BUCKET_SUGGESTED_TAGS,
	bucketLabel,
	compactLabel,
	detailLabel,
	groupByBucket,
	isCompactLabelRedundant,
	linkCtasFor,
	storefrontFor,
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

	it("returns 'Fullstack' when Web bucket spans frontend/backend families via framework tags", () => {
		// React (frontend family) + Vapor (backend family) — the Fullstack
		// signal is the family span, not the literal `Frontend`/`Backend` labels.
		expect(
			compactLabel(PlatformBucket.Web, [PlatformTag.React, PlatformTag.Vapor])
		).toBe("Fullstack")
	})

	it("returns 'Fullstack' for mixed literal + framework families (e.g. Frontend + Node)", () => {
		expect(
			compactLabel(PlatformBucket.Web, [PlatformTag.Frontend, PlatformTag.Node])
		).toBe("Fullstack")
	})

	it("returns 'Fullstack' for [React, Next] (Next.js cross-listed as backend signals the server half)", () => {
		expect(
			compactLabel(PlatformBucket.Web, [PlatformTag.React, PlatformTag.Next])
		).toBe("Fullstack")
	})

	it("collapses multiple Web frontend-only tags (no Next.js) to the bucket label", () => {
		expect(
			compactLabel(PlatformBucket.Web, [
				PlatformTag.React,
				PlatformTag.Frontend,
			])
		).toBe("Web")
	})

	it("collapses multiple backend-only Web tags to the bucket label", () => {
		expect(
			compactLabel(PlatformBucket.Web, [PlatformTag.Node, PlatformTag.Vapor])
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

	it("renders Web + [Next] alone as 'Next.js' (single-tag rule wins before Fullstack)", () => {
		// `Next` is cross-listed in both Web families, so the Fullstack branch
		// would match if it ran on a single tag. But the 1-tag rule short-
		// circuits first, so the label is the tag's own display name. Pin this
		// so a future refactor that reorders the branches doesn't silently flip
		// to "Fullstack".
		expect(compactLabel(PlatformBucket.Web, [PlatformTag.Next])).toBe("Next.js")
	})

	it("returns 'Multiplatform' for OpenSource + [CLI, Frontend]", () => {
		// OSS-flavor tag + a Web-family tag that isn't in OpenSource's natural
		// set. Doesn't span frontend+backend families, so Fullstack doesn't
		// apply; doesn't stay within OSS's natural set, so the bucket-label
		// fallback doesn't apply either.
		expect(
			compactLabel(PlatformBucket.OpenSource, [
				PlatformTag.CLI,
				PlatformTag.Frontend,
			])
		).toBe("Multiplatform")
	})

	it("returns 'Multiplatform' for OpenSource + [SDK, macOS]", () => {
		// SDK is OSS-flavor; macOS is outside OSS's natural set. Same logic as
		// above — neither Fullstack nor bucket-label fits.
		expect(
			compactLabel(PlatformBucket.OpenSource, [
				PlatformTag.SDK,
				PlatformTag.macOS,
			])
		).toBe("Multiplatform")
	})

	it("returns 'Fullstack' for OpenSource + [Library, React, Node] (spans web families)", () => {
		// Pins the Session 2 extension of Fullstack to the OpenSource bucket:
		// once an OSS project's tags include both a Web frontend-family tag and
		// a Web backend-family tag, the label flips to "Fullstack" regardless
		// of any additional OSS-flavor tags.
		expect(
			compactLabel(PlatformBucket.OpenSource, [
				PlatformTag.Library,
				PlatformTag.React,
				PlatformTag.Node,
			])
		).toBe("Fullstack")
	})
})

// #endregion

// #region detailLabel

describe("detailLabel", () => {
	it("joins tags with ', '", () => {
		expect(
			detailLabel(PlatformBucket.iOS, [
				PlatformTag.iOS,
				PlatformTag.iPad,
				PlatformTag.Android,
			])
		).toBe("iOS, iPad, Android")
	})

	it("renames tags via TAG_LABELS when rendering", () => {
		expect(
			detailLabel(PlatformBucket.Mac, [PlatformTag.macOS, PlatformTag.MenuBar])
		).toBe("macOS, Menu bar")
	})

	it("falls back to the bucket label when there are no tags", () => {
		expect(detailLabel(PlatformBucket.Web, [])).toBe("Web")
	})

	it("treats null/undefined tags as empty (defensive against Postgres NULL rows)", () => {
		expect(detailLabel(PlatformBucket.iOS, null)).toBe("iOS")
		expect(detailLabel(PlatformBucket.iOS, undefined)).toBe("iOS")
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

	it("treats null/undefined tags as empty (defensive against Postgres NULL rows)", () => {
		// 0 tags → bucket label → redundant.
		expect(isCompactLabelRedundant(PlatformBucket.iOS, null)).toBe(true)
		expect(isCompactLabelRedundant(PlatformBucket.iOS, undefined)).toBe(true)
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

// #region storefrontFor

describe("storefrontFor", () => {
	it("maps the iOS bucket to the App Store", () => {
		expect(storefrontFor(PlatformBucket.iOS)).toBe("AppStore")
	})

	it("maps the Mac bucket to the Mac App Store", () => {
		expect(storefrontFor(PlatformBucket.Mac)).toBe("MacAppStore")
	})

	it("has no storefront for the non-app buckets", () => {
		expect(storefrontFor(PlatformBucket.Web)).toBeNull()
		expect(storefrontFor(PlatformBucket.OpenSource)).toBeNull()
	})
})

// #endregion

// #region linkCtasFor

describe("linkCtasFor", () => {
	const iosListing = {
		label: "App Store",
		url: "https://apps.apple.com/app/id111",
	}
	const macListing = {
		label: "Mac App Store",
		url: "https://apps.apple.com/app/id222",
	}
	const github = { label: "GitHub", url: "https://github.com/rolandleth/test" }

	function ctasFor(
		links: { label: string; url: string }[],
		overrides: Partial<{
			bucket: PlatformBucket
			isOwnApp: boolean
			isDiscontinued: boolean
		}> = {}
	) {
		return linkCtasFor({
			bucket: PlatformBucket.iOS,
			isOwnApp: false,
			isDiscontinued: false,
			links,
			...overrides,
		}).map(({ cta }) => cta)
	}

	it("returns each link alongside its CTA, in order", () => {
		const entries = linkCtasFor({
			bucket: PlatformBucket.iOS,
			isOwnApp: false,
			isDiscontinued: false,
			links: [github, iosListing],
		})

		expect(entries.map(({ link }) => link)).toEqual([github, iosListing])
	})

	it("returns nothing for a project without links", () => {
		expect(ctasFor([])).toEqual([])
	})

	it("leaves every link of an own app with no storefront link as a plain pill", () => {
		// An own open-source project: no store to badge and nothing to prefix.
		const website = { label: "Website", url: "https://example.com" }

		expect(
			ctasFor([github, website], {
				isOwnApp: true,
				bucket: PlatformBucket.OpenSource,
			})
		).toEqual([
			{ kind: "plainPill", label: "GitHub" },
			{ kind: "plainPill", label: "Website" },
		])
	})

	it("prefixes a storefront link with 'Get on' when the project isn't an own app", () => {
		expect(ctasFor([iosListing, github])).toEqual([
			{ kind: "storePill", label: "Get on App Store" },
			{ kind: "plainPill", label: "GitHub" },
		])
	})

	it("renders the only storefront link of an own iOS app as the App Store badge", () => {
		expect(ctasFor([iosListing, github], { isOwnApp: true })).toEqual([
			{ kind: "badge", storefront: "AppStore" },
			{ kind: "plainPill", label: "GitHub" },
		])
	})

	it("renders the only storefront link of an own Mac app as the Mac App Store badge", () => {
		expect(
			ctasFor([macListing], { isOwnApp: true, bucket: PlatformBucket.Mac })
		).toEqual([{ kind: "badge", storefront: "MacAppStore" }])
	})

	it("prefixes a storefront link with 'Download on' on an own app outside the app buckets", () => {
		expect(
			ctasFor([iosListing], { isOwnApp: true, bucket: PlatformBucket.Web })
		).toEqual([{ kind: "storePill", label: "Download on App Store" }])
	})

	// The bucket names one store and the URL can't say which listing is which,
	// so a badge on either link could name the wrong store.
	it("keeps every storefront link of an own app on a 'Download on' pill when there are several", () => {
		expect(
			ctasFor([iosListing, macListing, github], {
				isOwnApp: true,
				bucket: PlatformBucket.Mac,
			})
		).toEqual([
			{ kind: "storePill", label: "Download on App Store" },
			{ kind: "storePill", label: "Download on Mac App Store" },
			{ kind: "plainPill", label: "GitHub" },
		])
	})

	it("keeps 'Get on' on every storefront link of a project that isn't an own app", () => {
		expect(ctasFor([iosListing, macListing])).toEqual([
			{ kind: "storePill", label: "Get on App Store" },
			{ kind: "storePill", label: "Get on Mac App Store" },
		])
	})

	it("renders every link of a discontinued project with its bare label", () => {
		const expected = [
			{ kind: "plainPill", label: "App Store" },
			{ kind: "plainPill", label: "GitHub" },
		]

		expect(ctasFor([iosListing, github], { isDiscontinued: true })).toEqual(
			expected
		)
		expect(
			ctasFor([iosListing, github], { isDiscontinued: true, isOwnApp: true })
		).toEqual(expected)
	})

	it("treats the legacy itunes.apple.com host as a storefront", () => {
		expect(
			ctasFor(
				[
					{
						label: "App Store",
						url: "https://itunes.apple.com/ro/app/id1492111259",
					},
				],
				{ isOwnApp: true }
			)
		).toEqual([{ kind: "badge", storefront: "AppStore" }])
	})

	it("treats other Apple hosts as plain links", () => {
		expect(
			ctasFor([
				{ label: "TestFlight", url: "https://testflight.apple.com/join/abc" },
			])
		).toEqual([{ kind: "plainPill", label: "TestFlight" }])
	})

	// `projectLinkSchema` validates `url` on write, so a malformed URL only
	// reaches here from a legacy or hand-edited row.
	it("treats a malformed URL as a plain link that doesn't count as a storefront", () => {
		expect(
			ctasFor([{ label: "Broken", url: "not-a-url" }, iosListing], {
				isOwnApp: true,
			})
		).toEqual([
			{ kind: "plainPill", label: "Broken" },
			{ kind: "badge", storefront: "AppStore" },
		])
	})
})

// #endregion
