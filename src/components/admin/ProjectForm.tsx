"use client"

import { useCallback, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import FaqManager, { type FaqItem } from "@/components/admin/FaqManager"
import ImageUpload from "@/components/admin/ImageUpload"
import LinkManager, { type LinkItem } from "@/components/admin/LinkManager"
import PlatformPicker from "@/components/admin/PlatformPicker"
import SectionManager, {
	type SectionImage,
	type SectionItem,
} from "@/components/admin/SectionManager"
import { useAdminResource } from "@/components/admin/useAdminResource"
import PresetOrFreeformInput from "@/components/ui/PresetOrFreeformInput"
import { PlatformBucket, PlatformTag } from "@/generated/prisma/enums"

interface InitialData {
	id: number
	name: string
	summary: string
	bucket: PlatformBucket
	platformTags: PlatformTag[]
	role: string | null
	accentColor: string | null
	icon: string | null
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	isFeatured: boolean
	isDiscontinued: boolean
	date: string | null
	sortOrder: number
	sections: (Omit<SectionItem, "_key" | "images"> & {
		id?: number
		images: (Omit<SectionImage, "_key"> & { id?: number })[]
	})[]
	links: (Omit<LinkItem, "_key"> & { id?: number })[]
	faqs: (Omit<FaqItem, "_key"> & { id?: number })[]
}

interface Props {
	initialData?: InitialData
}

interface ProjectPayload {
	name: string
	summary: string
	bucket: PlatformBucket
	platformTags: PlatformTag[]
	role: string | null
	accentColor: string | null
	icon: string | null
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	isFeatured: boolean
	isDiscontinued: boolean
	date: string | null
	sortOrder: number
	sections: (Omit<SectionItem, "_key" | "images"> & {
		images: Omit<SectionImage, "_key">[]
	})[]
	links: Omit<LinkItem, "_key">[]
	faqs: Omit<FaqItem, "_key">[]
}

const ROLE_OPTIONS = [
	"Sole developer",
	"Lead",
	"Co-founder",
	"Employee",
	"Contractor",
	"Consultant",
	"Contributor",
	"Maintainer",
	"Creator",
]

interface FormState {
	name: string
	bucket: PlatformBucket | null
	platformTags: PlatformTag[]
	role: string
	date: string
	sortOrder: number
	accentColor: string
	summary: string
	icon: string
	cardImage: string
	ogImage: string
	heroImage: string
	isFeatured: boolean
	isDiscontinued: boolean
	sections: SectionItem[]
	links: LinkItem[]
	faqs: FaqItem[]
}

export default function ProjectForm({ initialData }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } =
		useAdminResource<ProjectPayload>({
			resource: "projects",
			id: initialData?.id ?? null,
		})

	// Client-side validation error for fields the HTML `required` attribute
	// can't reach (the platform picker is a button group, not an input). The
	// previous picker used a hidden `required readOnly` text input as a submit
	// gate; screen readers couldn't announce that field and the browser
	// tooltip pointed at nothing visible. Surfacing through `<ErrorMessage>`
	// keeps the gate visible and announced.
	const [validationError, setValidationError] = useState<string | null>(null)

	// Single state object so a partial-update setter (`setField`) can stand in
	// for the thirteen individual `useState` setters this form used to carry.
	// The callback identity is stable across renders so `SectionManager`,
	// `LinkManager`, and `ImageUpload` get the same `onChange` reference each
	// render — combine that with future `React.memo` on those children to skip
	// re-renders triggered by unrelated field edits.
	const [state, setState] = useState<FormState>({
		name: initialData?.name ?? "",
		bucket: initialData?.bucket ?? null,
		platformTags: initialData?.platformTags ?? [],
		role: initialData?.role ?? "",
		date: initialData?.date ?? "",
		sortOrder: initialData?.sortOrder ?? 0,
		accentColor: initialData?.accentColor ?? "",
		summary: initialData?.summary ?? "",
		icon: initialData?.icon ?? "",
		cardImage: initialData?.cardImage ?? "",
		ogImage: initialData?.ogImage ?? "",
		heroImage: initialData?.heroImage ?? "",
		isFeatured: initialData?.isFeatured ?? false,
		isDiscontinued: initialData?.isDiscontinued ?? false,
		sections: (initialData?.sections ?? []).map((section) => ({
			...section,
			_key: crypto.randomUUID(),
			images: section.images.map((image) => ({
				...image,
				_key: crypto.randomUUID(),
			})),
		})),
		links: (initialData?.links ?? []).map((link) => ({
			...link,
			_key: crypto.randomUUID(),
		})),
		faqs: (initialData?.faqs ?? []).map((faq) => ({
			...faq,
			_key: crypto.randomUUID(),
		})),
	})

	// Tracks the literal text in the sortOrder input so the user sees what
	// they typed during edits (including transient invalid states like `""`
	// while clearing). Committed `state.sortOrder` only updates on valid
	// digit-only input; on blur, invalid text snaps back to the committed
	// value. Mirrors the contract in `ProjectSortOrderInput.handleBlur` —
	// without this, invalid input silently coerced to `0` and erased the
	// previous value.
	const [sortOrderText, setSortOrderText] = useState(
		String(initialData?.sortOrder ?? 0)
	)

	const setField = useCallback(
		<K extends keyof FormState>(field: K, value: FormState[K]) => {
			setState((prev) => ({ ...prev, [field]: value }))
		},
		[]
	)

	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault()

		// Re-snap from `sortOrderText` before submitting: blur is the normal
		// commit path, but submit can fire before blur (Enter inside another
		// input, or a click on Save while sortOrder still has focus and
		// transient invalid text). Without this, the stale committed
		// `state.sortOrder` would ship — e.g. user typed `"5"` (commits 5),
		// then deleted to `""` (no commit), then clicked Save → 5 silently
		// submitted. Apply the same digit-only-or-snap-back rule the blur
		// handler uses.
		const trimmedSortOrder = sortOrderText.trim()
		const sortOrder = /^\d+$/.test(trimmedSortOrder)
			? Number(trimmedSortOrder)
			: state.sortOrder
		setSortOrderText(String(sortOrder))

		// Platform-picker gate. The picker is a chip group with no native
		// `required` attribute to bind, so the form is the only place that can
		// refuse an empty selection. Bail before `save` so we don't ship a
		// payload the API would 400 on, and so the error renders in the same
		// `<ErrorMessage>` slot the rest of the form uses.
		if (state.bucket == null) {
			setValidationError("Pick a platform bucket.")
			return
		}

		if (state.platformTags.length === 0) {
			setValidationError("Pick at least one platform tag.")
			return
		}

		setValidationError(null)

		await save({
			name: state.name,
			summary: state.summary,
			bucket: state.bucket,
			platformTags: state.platformTags,
			role: state.role || null,
			accentColor: state.accentColor || null,
			icon: state.icon || null,
			cardImage: state.cardImage || null,
			ogImage: state.ogImage || null,
			heroImage: state.heroImage || null,
			isFeatured: state.isFeatured,
			isDiscontinued: state.isDiscontinued,
			date: state.date || null,
			sortOrder,
			// Strip the client-only `_key` from sections, their nested images,
			// and links before sending.
			sections: state.sections.map(({ _key: _, images, ...rest }) => ({
				...rest,
				images: images.map(({ _key: __, ...imgRest }) => imgRest),
			})),
			links: state.links.map(({ _key: _, ...rest }) => rest),
			faqs: state.faqs.map(({ _key: _, ...rest }) => rest),
		})
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<label htmlFor="name" className="text-secondary text-sm font-medium">
					Name
				</label>
				<input
					id="name"
					type="text"
					value={state.name}
					onChange={(e) => setField("name", e.target.value)}
					required
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">Platform</span>
				<PlatformPicker
					bucket={state.bucket}
					tags={state.platformTags}
					onChange={({ bucket, tags }) => {
						setState((prev) => ({
							...prev,
							bucket,
							platformTags: tags,
						}))
						// Any picker activity invalidates a stale "pick a bucket / tag"
						// message — keep the error close to what the form is actually
						// rejecting right now.
						setValidationError(null)
					}}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="role" className="text-secondary text-sm font-medium">
					Role
				</label>
				<PresetOrFreeformInput
					id="role"
					value={state.role}
					onChange={(v) => setField("role", v)}
					presets={ROLE_OPTIONS}
					presetLabel="Select a role…"
					required
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="date" className="text-secondary text-sm font-medium">
					Date
				</label>
				<input
					id="date"
					type="text"
					value={state.date}
					onChange={(e) => setField("date", e.target.value)}
					placeholder="2023"
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="sortOrder"
					className="text-secondary text-sm font-medium"
				>
					Sort order
				</label>
				<input
					id="sortOrder"
					type="number"
					min={0}
					value={sortOrderText}
					onChange={(e) => {
						// Echo what the user typed so transient invalid states (e.g.
						// `""` mid-edit) don't get clobbered by the controlled value.
						// Only commit valid non-negative integers to `state.sortOrder`;
						// invalid input is held in the display until blur.
						const raw = e.target.value
						setSortOrderText(raw)
						if (/^\d+$/.test(raw)) {
							setField("sortOrder", Number(raw))
						}
					}}
					onBlur={() => {
						// Snap the visible text back to the last committed value if the
						// user left the input in an invalid state. Mirrors
						// `ProjectSortOrderInput.handleBlur`. Without this, the input
						// could keep showing `"3.7"` while state holds the prior value.
						if (!/^\d+$/.test(sortOrderText.trim())) {
							setSortOrderText(String(state.sortOrder))
						}
					}}
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="accentColor"
					className="text-secondary text-sm font-medium"
				>
					Accent color
				</label>
				<input
					id="accentColor"
					type="text"
					value={state.accentColor}
					onChange={(e) => setField("accentColor", e.target.value)}
					placeholder="#6366f1"
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="summary" className="text-secondary text-sm font-medium">
					Summary
				</label>
				<textarea
					id="summary"
					value={state.summary}
					onChange={(e) => setField("summary", e.target.value)}
					required
					rows={4}
					className="admin-input"
				/>
			</div>

			<ImageUpload
				value={state.icon}
				onChange={(v) => setField("icon", v)}
				label="Icon URL"
			/>
			<ImageUpload
				value={state.cardImage}
				onChange={(v) => setField("cardImage", v)}
				label="Card image URL"
			/>
			<ImageUpload
				value={state.ogImage}
				onChange={(v) => setField("ogImage", v)}
				label="OG / social image URL"
			/>
			<ImageUpload
				value={state.heroImage}
				onChange={(v) => setField("heroImage", v)}
				label="Hero image URL"
			/>

			<div className="flex gap-6">
				<label className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={state.isFeatured}
						onChange={(e) => setField("isFeatured", e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-secondary text-sm font-medium">Featured</span>
				</label>

				<label className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={state.isDiscontinued}
						onChange={(e) => setField("isDiscontinued", e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-secondary text-sm font-medium">
						Discontinued
					</span>
				</label>
			</div>

			<div className="flex flex-col gap-1.5">
				{/* `SectionManager` / `LinkManager` are composite controls with no
					single input to bind via `htmlFor`. Heading styled like a label
					rather than declared as one. */}
				<span className="text-secondary text-sm font-medium">Sections</span>
				<SectionManager
					value={state.sections}
					onChange={(v) => setField("sections", v)}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">Links</span>
				<LinkManager
					value={state.links}
					onChange={(v) => setField("links", v)}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">FAQ</span>
				<FaqManager value={state.faqs} onChange={(v) => setField("faqs", v)} />
			</div>

			{(validationError ?? error) && (
				<ErrorMessage>{validationError ?? error}</ErrorMessage>
			)}

			<div className="flex items-center gap-4">
				<button
					type="submit"
					disabled={isSubmitting}
					className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting ? "Saving…" : "Save project"}
				</button>

				{isEditing && (
					<button
						type="button"
						onClick={remove}
						disabled={isSubmitting}
						className="rounded-md px-4 py-2 text-sm font-medium text-red-500 transition-opacity hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50"
					>
						Delete
					</button>
				)}
			</div>
		</form>
	)
}
