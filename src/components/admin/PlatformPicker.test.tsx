import { render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"
import { setupUser } from "@/test/user"
import PlatformPicker from "./PlatformPicker"

const user = setupUser()

// Controlled host for tests that need the picker to react to its own
// `onChange` (e.g. the prune-hint flow needs the next render to reflect the
// pruned tag list before the hint can render).
function ControlledPicker({
	initialBucket,
	initialTags,
}: {
	initialBucket: PlatformBucket | null
	initialTags: PlatformTag[]
}) {
	const [bucket, setBucket] = useState<PlatformBucket | null>(initialBucket)
	const [tags, setTags] = useState<PlatformTag[]>(initialTags)

	return (
		<PlatformPicker
			bucket={bucket}
			tags={tags}
			onChange={(next) => {
				setBucket(next.bucket)
				setTags(next.tags)
			}}
		/>
	)
}

// #region rendering

describe("PlatformPicker — rendering", () => {
	it("shows a prompt in the tag area when no bucket is selected", () => {
		render(<PlatformPicker bucket={null} tags={[]} onChange={vi.fn()} />)
		expect(screen.getByText(/pick a bucket/i)).toBeInTheDocument()
	})

	it("renders one button per bucket", () => {
		render(<PlatformPicker bucket={null} tags={[]} onChange={vi.fn()} />)
		expect(screen.getByRole("button", { name: "iOS" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Mac" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "Web" })).toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: "Open Source" })
		).toBeInTheDocument()
	})

	it("renders the iOS bucket's natural tags when bucket=iOS", () => {
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[]}
				onChange={vi.fn()}
			/>
		)
		expect(screen.getByRole("button", { name: "iPad" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "watchOS" })).toBeInTheDocument()
		// `iOS` collides with the bucket button label; assert there are two of them
		// (bucket + tag) to confirm both layers render.
		expect(screen.getAllByRole("button", { name: "iOS" })).toHaveLength(2)
	})

	it("does not render Web-only tags when bucket=iOS", () => {
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[]}
				onChange={vi.fn()}
			/>
		)
		expect(
			screen.queryByRole("button", { name: "React" })
		).not.toBeInTheDocument()
	})

	it("surfaces every tag when bucket=OpenSource (OSS spans platforms)", () => {
		render(
			<PlatformPicker
				bucket={PlatformBucket.OpenSource}
				tags={[]}
				onChange={vi.fn()}
			/>
		)
		expect(screen.getByRole("button", { name: "Library" })).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "React" })).toBeInTheDocument()
		// `iOS` collides with the bucket button label — assert at least one tag
		// chip exists alongside it.
		expect(
			screen.getAllByRole("button", { name: "iOS" }).length
		).toBeGreaterThanOrEqual(2)
	})

	it("renames MenuBar → 'Menu bar' on the chip", () => {
		render(
			<PlatformPicker
				bucket={PlatformBucket.Mac}
				tags={[]}
				onChange={vi.fn()}
			/>
		)
		expect(screen.getByRole("button", { name: "Menu bar" })).toBeInTheDocument()
	})
})

// #endregion

// #region bucket interactions

describe("PlatformPicker — bucket interactions", () => {
	it("emits { bucket, tags: [] } when clicking a bucket with no prior selection", async () => {
		const onChange = vi.fn()
		render(<PlatformPicker bucket={null} tags={[]} onChange={onChange} />)
		await user.click(screen.getByRole("button", { name: "Mac" }))
		expect(onChange).toHaveBeenCalledWith({
			bucket: PlatformBucket.Mac,
			tags: [],
		})
	})

	it("prunes tags that aren't in the new bucket's suggested set on bucket switch", async () => {
		const onChange = vi.fn()
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[PlatformTag.iOS, PlatformTag.iPad]}
				onChange={onChange}
			/>
		)
		await user.click(screen.getByRole("button", { name: "Web" }))
		// Neither iOS nor iPad is suggested under Web — both pruned.
		expect(onChange).toHaveBeenCalledWith({
			bucket: PlatformBucket.Web,
			tags: [],
		})
	})

	it("keeps tags that are valid for the new bucket (OpenSource surfaces all)", async () => {
		const onChange = vi.fn()
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[PlatformTag.iOS]}
				onChange={onChange}
			/>
		)
		// OpenSource's suggested set includes every tag, so iOS is preserved.
		await user.click(screen.getByRole("button", { name: "Open Source" }))
		expect(onChange).toHaveBeenCalledWith({
			bucket: PlatformBucket.OpenSource,
			tags: [PlatformTag.iOS],
		})
	})

	it("is a no-op when clicking the already-selected bucket", async () => {
		const onChange = vi.fn()
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[PlatformTag.iOS]}
				onChange={onChange}
			/>
		)
		// Two iOS buttons render (bucket + tag); click the bucket one (first).
		await user.click(screen.getAllByRole("button", { name: "iOS" })[0])
		expect(onChange).not.toHaveBeenCalled()
	})
})

// #endregion

// #region tag interactions

describe("PlatformPicker — tag interactions", () => {
	it("adds a tag when clicked", async () => {
		const onChange = vi.fn()
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[]}
				onChange={onChange}
			/>
		)
		await user.click(screen.getByRole("button", { name: "iPad" }))
		expect(onChange).toHaveBeenCalledWith({
			bucket: PlatformBucket.iOS,
			tags: [PlatformTag.iPad],
		})
	})

	it("removes a tag when it is already selected", async () => {
		const onChange = vi.fn()
		render(
			<PlatformPicker
				bucket={PlatformBucket.iOS}
				tags={[PlatformTag.iOS, PlatformTag.iPad]}
				onChange={onChange}
			/>
		)
		// Click the iPad tag chip (only one iPad button — it's a tag, not a bucket).
		await user.click(screen.getByRole("button", { name: "iPad" }))
		expect(onChange).toHaveBeenCalledWith({
			bucket: PlatformBucket.iOS,
			tags: [PlatformTag.iOS],
		})
	})

	it("appends a Web tag when bucket=Web", async () => {
		const onChange = vi.fn()
		render(
			<PlatformPicker
				bucket={PlatformBucket.Web}
				tags={[PlatformTag.Frontend]}
				onChange={onChange}
			/>
		)
		await user.click(screen.getByRole("button", { name: "Backend" }))
		expect(onChange).toHaveBeenCalledWith({
			bucket: PlatformBucket.Web,
			tags: [PlatformTag.Frontend, PlatformTag.Backend],
		})
	})
})

// #endregion

// #region prune-hint

describe("PlatformPicker — prune hint", () => {
	it("shows a status message when bucket switch drops tags incompatible with the new bucket", async () => {
		render(
			<ControlledPicker
				initialBucket={PlatformBucket.iOS}
				initialTags={[PlatformTag.iOS, PlatformTag.iPad]}
			/>
		)
		await user.click(screen.getByRole("button", { name: "Web" }))
		// Both iOS and iPad are outside Web's suggested set → both pruned.
		expect(await screen.findByRole("status")).toHaveTextContent(
			/Removed 2 tags? not valid for this bucket/i
		)
	})

	it("uses the singular form when exactly one tag is pruned", async () => {
		render(
			<ControlledPicker
				initialBucket={PlatformBucket.iOS}
				initialTags={[PlatformTag.iOS]}
			/>
		)
		await user.click(screen.getByRole("button", { name: "Mac" }))
		expect(await screen.findByRole("status")).toHaveTextContent(
			/Removed 1 tag not valid/i
		)
	})

	it("does not show the hint when bucket switch keeps every tag", async () => {
		render(
			<ControlledPicker
				initialBucket={PlatformBucket.iOS}
				initialTags={[PlatformTag.iOS]}
			/>
		)
		// OpenSource accepts every tag, so nothing is pruned.
		await user.click(screen.getByRole("button", { name: "Open Source" }))
		expect(screen.queryByRole("status")).not.toBeInTheDocument()
	})

	it("clears the hint when the user interacts with a tag chip", async () => {
		render(
			<ControlledPicker
				initialBucket={PlatformBucket.iOS}
				initialTags={[PlatformTag.iOS, PlatformTag.iPad]}
			/>
		)
		await user.click(screen.getByRole("button", { name: "Web" }))
		expect(await screen.findByRole("status")).toBeInTheDocument()

		// Picking any tag dismisses the hint — the user has acknowledged the
		// prune by moving on.
		await user.click(screen.getByRole("button", { name: "Frontend" }))
		expect(screen.queryByRole("status")).not.toBeInTheDocument()
	})
})

// #endregion
