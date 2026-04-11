import { describe, expect, it } from "vitest"
import {
	formatPlatformDisplay,
	groupByPlatform,
	isPlatformRedundantWithSection,
	platformBucket,
} from "@/lib/platforms"

// #region isPlatformRedundantWithSection

describe("isPlatformRedundantWithSection", () => {
	it("returns true for an exact match", () => {
		expect(isPlatformRedundantWithSection("iOS", "iOS")).toBe(true)
	})

	it("is case-insensitive for exact match", () => {
		expect(isPlatformRedundantWithSection("ios", "iOS")).toBe(true)
	})

	it("returns true when platform starts with section (macOS → Mac)", () => {
		expect(isPlatformRedundantWithSection("macOS", "Mac")).toBe(true)
	})

	it("returns true when section starts with platform (Mac → macOS)", () => {
		expect(isPlatformRedundantWithSection("Mac", "macOS")).toBe(true)
	})

	it("returns false for unrelated platform and section", () => {
		expect(isPlatformRedundantWithSection("iOS", "Web")).toBe(false)
	})

	it("always returns false when platform contains a comma", () => {
		expect(isPlatformRedundantWithSection("iOS, Mac", "iOS")).toBe(false)
	})
})

// #endregion

// #region formatPlatformDisplay

describe("formatPlatformDisplay", () => {
	it("returns the platform unchanged when there is no comma", () => {
		expect(formatPlatformDisplay("iOS")).toBe("iOS")
	})

	it("returns 'Fullstack' when all parts are web bucket keywords (lowercase)", () => {
		expect(formatPlatformDisplay("react, node")).toBe("Fullstack")
	})

	it("returns 'Fullstack' when all parts are web bucket keywords (mixed case)", () => {
		expect(formatPlatformDisplay("React, Node")).toBe("Fullstack")
	})

	it("returns 'Fullstack' for a single-keyword web value with a comma (e.g. 'frontend, backend')", () => {
		expect(formatPlatformDisplay("frontend, backend")).toBe("Fullstack")
	})

	it("returns 'Multiplatform' when parts span multiple buckets", () => {
		expect(formatPlatformDisplay("iOS, react")).toBe("Multiplatform")
	})

	it("returns 'Multiplatform' for mixed native/web keywords", () => {
		expect(formatPlatformDisplay("Mac, Node")).toBe("Multiplatform")
	})
})

// #endregion

// #region platformBucket

describe("platformBucket", () => {
	it("maps iOS keyword to iOS bucket", () => {
		expect(platformBucket("ios")).toBe("iOS")
	})

	it("maps android keyword to iOS bucket", () => {
		expect(platformBucket("android")).toBe("iOS")
	})

	it("maps mac keyword to Mac bucket", () => {
		expect(platformBucket("mac")).toBe("Mac")
	})

	it("maps menu bar to Mac bucket", () => {
		expect(platformBucket("menu bar app")).toBe("Mac")
	})

	it("maps react to Web bucket", () => {
		expect(platformBucket("react")).toBe("Web")
	})

	it("maps node to Web bucket", () => {
		expect(platformBucket("node")).toBe("Web")
	})

	it("maps cli to Open Source bucket", () => {
		expect(platformBucket("cli")).toBe("Open Source")
	})

	it("maps package to Open Source bucket", () => {
		expect(platformBucket("package")).toBe("Open Source")
	})

	it("returns Other for an unknown platform", () => {
		expect(platformBucket("game")).toBe("Other")
	})
})

// #endregion

// #region groupByPlatform

describe("groupByPlatform", () => {
	it("returns an empty array for empty input", () => {
		expect(groupByPlatform([])).toEqual([])
	})

	it("groups projects into the correct buckets", () => {
		const projects = [
			{ platform: "react", name: "Web App" },
			{ platform: "ios", name: "Mobile App" },
			{ platform: "mac", name: "Desktop App" },
		]
		const result = groupByPlatform(projects)
		const labels = result.map((g) => g.label)

		expect(labels).toContain("iOS")
		expect(labels).toContain("Mac")
		expect(labels).toContain("Web")
	})

	it("preserves canonical order: iOS → Mac → Web → Open Source → Other", () => {
		const projects = [
			{ platform: "react", name: "A" },
			{ platform: "cli", name: "B" },
			{ platform: "mac", name: "C" },
			{ platform: "ios", name: "D" },
			{ platform: "game", name: "E" },
		]
		const labels = groupByPlatform(projects).map((g) => g.label)

		expect(labels).toEqual(["iOS", "Mac", "Web", "Open Source", "Other"])
	})

	it("places all projects of the same platform in one bucket", () => {
		const projects = [
			{ platform: "ios", name: "A" },
			{ platform: "ios", name: "B" },
		]
		const result = groupByPlatform(projects)

		expect(result).toHaveLength(1)
		expect(result[0].projects).toHaveLength(2)
	})

	it("omits buckets that have no projects", () => {
		const projects = [{ platform: "ios", name: "A" }]
		const labels = groupByPlatform(projects).map((g) => g.label)

		expect(labels).toEqual(["iOS"])
	})
})

// #endregion
