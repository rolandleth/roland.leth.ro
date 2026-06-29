import { beforeEach, describe, expect, it, vi } from "vitest"
import { GET } from "@/app/llms.txt/route"
import { siteBase } from "@/lib/api/request"
import { getProjectsGalleryCached } from "@/lib/db/projects"

vi.mock("@/lib/api/request", () => ({
	siteBase: vi.fn(),
}))

vi.mock("@/lib/db/projects", () => ({
	getProjectsGalleryCached: vi.fn(),
}))

const BASE = "https://roland.leth.ro"

function projectStub(
	overrides: { name?: string; slug?: string; summary?: string } = {}
) {
	return {
		name: "Continuum",
		slug: "continuum",
		summary: "A habit tracker.",
		...overrides,
	}
}

beforeEach(() => {
	vi.resetAllMocks()
	vi.mocked(siteBase).mockResolvedValue(BASE)
	vi.mocked(getProjectsGalleryCached).mockResolvedValue([])
})

// #region Response

describe("llms.txt — response", () => {
	it("serves plain text", async () => {
		const response = await GET()
		expect(response.headers.get("Content-Type")).toBe(
			"text/plain; charset=utf-8"
		)
	})

	it("opens with the site heading and overview", async () => {
		const body = await (await GET()).text()
		expect(body).toContain("# Roland Leth")
		expect(body).toContain("roland.leth.ro")
	})

	it("links the tech blog, about, and sitemap", async () => {
		const body = await (await GET()).text()
		expect(body).toContain(`${BASE}/blog/tech`)
		expect(body).toContain(`${BASE}/about`)
		expect(body).toContain(`${BASE}/sitemap.xml`)
	})

	it("omits the life blog and tools links", async () => {
		const body = await (await GET()).text()
		expect(body).not.toContain(`${BASE}/blog/life`)
		expect(body).not.toContain(`${BASE}/tools/`)
	})
})

// #endregion

// #region Projects

describe("llms.txt — projects", () => {
	it("emits one line per project with name, link, and summary", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({
				name: "Reckon",
				slug: "reckon",
				summary: "A calorie tracker.",
			}) as never,
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Reckon](${BASE}/projects/reckon): A calorie tracker.`
		)
	})

	it("collapses multi-line summaries onto a single line", async () => {
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub({ summary: "Line one.\n\nLine two." }) as never,
		])

		const body = await (await GET()).text()
		expect(body).toContain(
			`- [Continuum](${BASE}/projects/continuum): Line one. Line two.`
		)
	})

	it("derives project links from siteBase", async () => {
		vi.mocked(siteBase).mockResolvedValue("https://preview.example.com")
		vi.mocked(getProjectsGalleryCached).mockResolvedValue([
			projectStub() as never,
		])

		const body = await (await GET()).text()
		expect(body).toContain("https://preview.example.com/projects/continuum")
	})
})

// #endregion
