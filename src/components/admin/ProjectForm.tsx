"use client"

import { useId, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import FaqManager, { type FaqItem } from "@/components/admin/FaqManager"
import ImageUpload from "@/components/admin/ImageUpload"
import LinkManager, { type LinkItem } from "@/components/admin/LinkManager"
import PlatformPicker from "@/components/admin/PlatformPicker"
import {
	DISCONTINUED_PLACEMENT_HINT,
	PAGE_LAYOUT_LABELS,
	PAGE_LAYOUT_OPTIONS,
	PROMINENCE_LABELS,
	PROMINENCE_OPTIONS,
	STATUS_LABELS,
	STATUS_OPTIONS,
} from "@/components/admin/projectPlacement"
import SectionManager, {
	type SectionImage,
	type SectionItem,
} from "@/components/admin/SectionManager"
import SlugField from "@/components/admin/SlugField"
import { useAdminResource } from "@/components/admin/useAdminResource"
import { useFormState } from "@/components/admin/useFormState"
import { useUnsavedChangesGuard } from "@/components/admin/useUnsavedChangesGuard"
import { useUploadTracker } from "@/components/admin/useUploadTracker"
import PresetOrFreeformInput from "@/components/ui/PresetOrFreeformInput"
import {
	PlatformBucket,
	PlatformTag,
	ProjectPageLayout,
	ProjectProminence,
	ProjectStatus,
} from "@/generated/prisma/enums"
import {
	PRODUCT_PAGE_TEXT_KEYS,
	PRODUCT_PAGE_TEXT_LIMITS,
	type ProductPageTextKey,
} from "@/lib/api/schemas"
import { followTitleSlug } from "@/lib/utils/format"
import { isPlacementOverridden } from "@/lib/utils/projectsGallery"

type InitialData = {
	id: number
	name: string
	slug: string
	summary: string
	bucket: PlatformBucket
	platformTags: PlatformTag[]
	role: string | null
	accentColor: string | null
	icon: string | null
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	prominence: ProjectProminence
	pageLayout: ProjectPageLayout
	status: ProjectStatus
	isOwnApp: boolean
	date: string | null
	sortOrder: number
	sections: (Omit<SectionItem, "_key" | "images"> & {
		id?: number
		images: (Omit<SectionImage, "_key"> & { id?: number })[]
	})[]
	links: (Omit<LinkItem, "_key"> & { id?: number })[]
	faqs: (Omit<FaqItem, "_key"> & { id?: number })[]
} & Partial<Record<ProductPageField, string | null>>

interface Props {
	initialData?: InitialData
}

/**
 * How the form shows each product-page text field, all optional on the page
 * and all plain strings in the form; each input's `maxLength` comes from
 * `PRODUCT_PAGE_TEXT_LIMITS`. A `Record`, so a field the schema adds fails the
 * build until it has a label here. `plans`, `palette` and `offers` are
 * manifest-only and never sent from here, so a save leaves what the import
 * wrote.
 */
const PRODUCT_PAGE_FIELDS: Record<
	ProductPageTextKey,
	{ label: string; isMultiline?: boolean }
> = {
	metaDescription: {
		label: "Meta description (defaults to the summary)",
		isMultiline: true,
	},
	heroEyebrow: { label: "Hero eyebrow" },
	heroHeadline: { label: "Hero headline" },
	heroImageAlt: { label: "Hero image alt text" },
	storeNote: { label: "Store button note" },
	closingHeadline: { label: "Closing headline" },
	closingBody: { label: "Closing text", isMultiline: true },
	disclaimer: { label: "Disclaimer", isMultiline: true },
}

/**
 * The one product-page field every layout uses: it sets the search snippet of
 * any project (`generateMetadata`), so it sits under the summary, outside the
 * "Product page" group. Hidden with the group, it would go on setting the
 * snippet of a portfolio page with no way to see or clear it.
 */
const EVERY_LAYOUT_FIELD = "metaDescription" satisfies ProductPageTextKey

/** The fields the "Product page" group shows, in the schema's order. */
const PRODUCT_LAYOUT_FIELDS = PRODUCT_PAGE_TEXT_KEYS.filter(
	(key) => key !== EVERY_LAYOUT_FIELD
)

type ProductPageField = ProductPageTextKey

/** Empty-or-whitespace means "not set", which the API stores as null. */
function textOrNull(value: string): string | null {
	const trimmed = value.trim()

	return trimmed === "" ? null : trimmed
}

/**
 * Builds one value per product-page field. The cast is the one place the keys
 * are trusted: `Object.fromEntries` types its result as a string-keyed record,
 * and the entries come from `PRODUCT_PAGE_TEXT_KEYS` itself, so every key is
 * present.
 */
function mapProductPageFields<T>(
	value: (key: ProductPageField) => T
): Record<ProductPageField, T> {
	return Object.fromEntries(
		PRODUCT_PAGE_TEXT_KEYS.map((key) => [key, value(key)])
	) as Record<ProductPageField, T>
}

type ProjectPayload = {
	name: string
	/** Sent on create only; the update schema has no slug. */
	slug?: string
	summary: string
	bucket: PlatformBucket
	platformTags: PlatformTag[]
	role: string | null
	accentColor: string | null
	icon: string | null
	cardImage: string | null
	ogImage: string | null
	heroImage: string | null
	prominence: ProjectProminence
	pageLayout: ProjectPageLayout
	status: ProjectStatus
	isOwnApp: boolean
	date: string | null
	sortOrder: number
	sections: (Omit<SectionItem, "_key" | "images"> & {
		images: (Omit<SectionImage, "_key" | "alt"> & { alt: string | null })[]
	})[]
	links: Omit<LinkItem, "_key">[]
	faqs: Omit<FaqItem, "_key">[]
} & Record<ProductPageField, string | null>

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
	slug: string
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
	prominence: ProjectProminence
	pageLayout: ProjectPageLayout
	status: ProjectStatus
	isOwnApp: boolean
	productPage: Record<ProductPageField, string>
	sections: SectionItem[]
	links: LinkItem[]
	faqs: FaqItem[]
}

export default function ProjectForm({ initialData }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, hasSucceeded, error } =
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
	// One key space for every uploader on the form: the top-level fields report
	// under fixed names (`"icon"`, `"heroImage"`, …), section images under their
	// `_key`, a `crypto.randomUUID()`. The two can't collide as long as no fixed
	// name is UUID-shaped.
	const { isUploading, reportUploading } = useUploadTracker()
	const placementHintId = useId()

	// Single state object so a partial-update setter (`setField`) can stand in
	// for the thirteen individual `useState` setters this form used to carry.
	// The list managers get `updateField`, which applies each change to the
	// latest list: an image upload that finishes after other edits would
	// otherwise put back the sections as they were when the file was picked.
	const { state, setField, updateField, setState, isDirty } =
		useFormState<FormState>({
			name: initialData?.name ?? "",
			slug: initialData?.slug ?? "",
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
			prominence: initialData?.prominence ?? ProjectProminence.low,
			pageLayout: initialData?.pageLayout ?? ProjectPageLayout.portfolio,
			status: initialData?.status ?? ProjectStatus.live,
			isOwnApp: initialData?.isOwnApp ?? false,
			productPage: mapProductPageFields((key) => initialData?.[key] ?? ""),
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
	const initialSortOrderText = String(initialData?.sortOrder ?? 0)
	const [sortOrderText, setSortOrderText] = useState(initialSortOrderText)
	// The sort-order text counts on its own: an invalid value typed but not
	// yet committed to `state.sortOrder` is still an edit. So does an upload in
	// flight, whose URL reaches the state only when it lands.
	useUnsavedChangesGuard(
		(isDirty || sortOrderText !== initialSortOrderText || isUploading) &&
			!hasSucceeded
	)

	// On create, the slug follows the name until the author types their own. On
	// edit it is fixed, so the name changes alone.
	function handleNameChange(name: string) {
		setState((prev) => ({
			...prev,
			name,
			slug: isEditing ? prev.slug : followTitleSlug(prev.slug, prev.name, name),
		}))
	}

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
			...(isEditing ? {} : { slug: state.slug }),
			summary: state.summary,
			bucket: state.bucket,
			platformTags: state.platformTags,
			role: state.role || null,
			accentColor: state.accentColor || null,
			icon: state.icon || null,
			cardImage: state.cardImage || null,
			ogImage: state.ogImage || null,
			heroImage: state.heroImage || null,
			prominence: state.prominence,
			pageLayout: state.pageLayout,
			status: state.status,
			isOwnApp: state.isOwnApp,
			...mapProductPageFields((key) => textOrNull(state.productPage[key])),
			date: state.date || null,
			sortOrder,
			// Strip the client-only `_key` from sections, their nested images,
			// and links before sending. An empty alt goes out as null: stored as
			// "", it would make the image decorative on the page.
			sections: state.sections.map(({ _key: _, images, ...rest }) => ({
				...rest,
				images: images.map(({ _key: __, alt, ...imgRest }) => ({
					...imgRest,
					alt: textOrNull(alt),
				})),
			})),
			links: state.links.map(({ _key: _, ...rest }) => rest),
			faqs: state.faqs.map(({ _key: _, ...rest }) => rest),
		})
	}

	const isPlacementHintShown = isPlacementOverridden(state)

	function renderProductPageField(key: ProductPageField) {
		const { label, isMultiline } = PRODUCT_PAGE_FIELDS[key]
		const id = `productPage-${key}`
		const inputProps = {
			id,
			value: state.productPage[key],
			onChange: (
				e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
			) => {
				const { value } = e.target

				updateField("productPage", (prev) => ({ ...prev, [key]: value }))
			},
			maxLength: PRODUCT_PAGE_TEXT_LIMITS[key],
			className: "admin-input",
		}

		return (
			<div key={key} className="flex flex-col gap-1.5">
				<label htmlFor={id} className="text-secondary text-sm font-medium">
					{label}
				</label>

				{isMultiline === true ? (
					<textarea rows={2} {...inputProps} />
				) : (
					<input type="text" {...inputProps} />
				)}
			</div>
		)
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
					onChange={(e) => handleNameChange(e.target.value)}
					required
					className="admin-input"
				/>
			</div>

			<SlugField
				value={state.slug}
				onChange={(slug) => setField("slug", slug)}
				isLocked={isEditing}
				placeholder="reckon"
				hint={
					isEditing
						? "Fixed after creation, so the project's URL and the guides that name it never break."
						: "Fills from the name until you edit it. Sets the URL, /projects/<slug>, and can't change after the first save."
				}
			/>

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

			{renderProductPageField(EVERY_LAYOUT_FIELD)}

			<ImageUpload
				value={state.icon}
				onChange={(v) => setField("icon", v)}
				label="Icon URL"
				onUploadingChange={(v) => reportUploading("icon", v)}
			/>
			<ImageUpload
				value={state.cardImage}
				onChange={(v) => setField("cardImage", v)}
				label="Card image URL"
				onUploadingChange={(v) => reportUploading("cardImage", v)}
			/>
			<ImageUpload
				value={state.ogImage}
				onChange={(v) => setField("ogImage", v)}
				label="OG / social image URL"
				onUploadingChange={(v) => reportUploading("ogImage", v)}
			/>
			<ImageUpload
				value={state.heroImage}
				onChange={(v) => setField("heroImage", v)}
				label="Hero image URL"
				onUploadingChange={(v) => reportUploading("heroImage", v)}
			/>

			{/* Three independent choices: how visible the project is on /projects
			    (High: a big tile, Medium: a card, Low: an icon under More projects;
			    a discontinued one goes under More projects whatever this says, and
			    the hint below says so when that overrides the level), which page it
			    gets, and its status (a coming-soon or discontinued one shows a label
			    and no store buttons). */}
			<div className="flex flex-col gap-1.5">
				<div className="flex flex-wrap gap-4">
					<label className="flex flex-col gap-1.5">
						<span className="text-secondary text-sm font-medium">
							Prominence
						</span>
						<select
							value={state.prominence}
							onChange={(e) =>
								setField("prominence", e.target.value as ProjectProminence)
							}
							aria-describedby={
								isPlacementHintShown ? placementHintId : undefined
							}
							className="admin-input"
						>
							{PROMINENCE_OPTIONS.map((value) => (
								<option key={value} value={value}>
									{PROMINENCE_LABELS[value]}
								</option>
							))}
						</select>
					</label>

					<label className="flex flex-col gap-1.5">
						<span className="text-secondary text-sm font-medium">Page</span>
						<select
							value={state.pageLayout}
							onChange={(e) =>
								setField("pageLayout", e.target.value as ProjectPageLayout)
							}
							className="admin-input"
						>
							{PAGE_LAYOUT_OPTIONS.map((value) => (
								<option key={value} value={value}>
									{PAGE_LAYOUT_LABELS[value]}
								</option>
							))}
						</select>
					</label>

					<label className="flex flex-col gap-1.5">
						<span className="text-secondary text-sm font-medium">Status</span>
						<select
							value={state.status}
							onChange={(e) =>
								setField("status", e.target.value as ProjectStatus)
							}
							aria-describedby={
								isPlacementHintShown ? placementHintId : undefined
							}
							className="admin-input"
						>
							{STATUS_OPTIONS.map((value) => (
								<option key={value} value={value}>
									{STATUS_LABELS[value]}
								</option>
							))}
						</select>
					</label>
				</div>

				{isPlacementHintShown && (
					<p id={placementHintId} className="text-secondary text-xs">
						{DISCONTINUED_PLACEMENT_HINT}
					</p>
				)}
			</div>

			<div className="flex gap-6">
				{/* Own product, not client or employer work. Decides only the store CTAs
				    on the detail page (`linkCtasFor`): Apple's badge on each storefront
				    link, where other work gets `Get on …` pills. Placement, layout and
				    status are the selects above. */}
				<label className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={state.isOwnApp}
						onChange={(e) => setField("isOwnApp", e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-secondary text-sm font-medium">Own app</span>
				</label>
			</div>

			{/* Only the product page renders these. Switching to the portfolio page
			    hides the group but keeps what was typed, and a save still sends it. */}
			{state.pageLayout === ProjectPageLayout.product && (
				<fieldset className="border-border flex flex-col gap-4 rounded-lg border p-4">
					<legend className="text-secondary px-1 text-sm font-medium">
						Product page
					</legend>

					{PRODUCT_LAYOUT_FIELDS.map(renderProductPageField)}
				</fieldset>
			)}

			<div className="flex flex-col gap-1.5">
				{/* `SectionManager` / `LinkManager` are composite controls with no
					single input to bind via `htmlFor`. Heading styled like a label
					rather than declared as one. */}
				<span className="text-secondary text-sm font-medium">Sections</span>
				<SectionManager
					value={state.sections}
					onChange={(update) => updateField("sections", update)}
					onUploadingChange={reportUploading}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">Links</span>
				<LinkManager
					value={state.links}
					onChange={(update) => updateField("links", update)}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">FAQ</span>
				<FaqManager
					value={state.faqs}
					onChange={(update) => updateField("faqs", update)}
				/>
			</div>

			{(validationError ?? error) && (
				<ErrorMessage>{validationError ?? error}</ErrorMessage>
			)}

			<div className="flex items-center gap-4">
				<button
					type="submit"
					disabled={isSubmitting || isUploading}
					className="admin-submit-btn"
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
