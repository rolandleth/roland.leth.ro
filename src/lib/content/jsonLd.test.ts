import { describe, expect, it } from "vitest"
import { personFor, safeJsonLdString } from "@/lib/content/jsonLd"

const BASE = "https://roland.leth.ro"

// #region safeJsonLdString

describe("safeJsonLdString", () => {
	it("escapes `<`, `>`, and `&` so values can't close the script tag or inject HTML", () => {
		const result = safeJsonLdString({
			"@context": "https://schema.org",
			"@type": "Question",
			name: "What about </script><img src=x onerror=alert(1)>?",
			text: "A & B",
		})

		expect(result).not.toContain("<")
		expect(result).not.toContain(">")
		expect(result).not.toContain("&")
		expect(result).toContain("\\u003c/script\\u003e")
		expect(result).toContain("\\u0026")
	})

	it("escapes U+2028 / U+2029 so the embedded JSON stays parseable", () => {
		const u2028 = String.fromCharCode(0x2028)
		const u2029 = String.fromCharCode(0x2029)
		const result = safeJsonLdString({ text: `line${u2028}break${u2029}para` })

		expect(result).not.toContain(u2028)
		expect(result).not.toContain(u2029)
		expect(result).toContain("\\u2028")
		expect(result).toContain("\\u2029")
	})

	it("round-trips back to the original value via JSON.parse", () => {
		const value = {
			question: "Is 1 < 2 & 2 > 1?",
			answer: "Yes",
		}

		expect(JSON.parse(safeJsonLdString(value))).toEqual(value)
	})
})

// #endregion

// #region personFor

describe("personFor", () => {
	it("builds the site's Person entity with the passed-in base as its url", () => {
		expect(personFor(BASE)).toEqual({
			"@type": "Person",
			name: "Roland Leth",
			url: BASE,
		})
	})
})

// #endregion
