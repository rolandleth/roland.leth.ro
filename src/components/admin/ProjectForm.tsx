"use client"

import { useCallback, useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import LinkManager, { type LinkItem } from "@/components/admin/LinkManager"
import PlatformPicker from "@/components/admin/PlatformPicker"
import SectionManager, {
	type SectionImage,
	type SectionItem,
} from "@/components/admin/SectionManager"
import { useAdminResource } from "@/components/admin/useAdminResource"
import PresetOrFreeformInput from "@/components/ui/PresetOrFreeformInput"

interface InitialData {
	id: number
	name: string
	summary: string
	platform: string
	role: string | null
	accentColor: string | null
	icon: string | null
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
}

interface Props {
	initialData?: InitialData
}

interface ProjectPayload {
	name: string
	summary: string
	platform: string
	role: string | null
	accentColor: string | null
	icon: string | null
	heroImage: string | null
	isFeatured: boolean
	isDiscontinued: boolean
	date: string | null
	sortOrder: number
	sections: (Omit<SectionItem, "_key" | "images"> & {
		images: Omit<SectionImage, "_key">[]
	})[]
	links: Omit<LinkItem, "_key">[]
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
	platform: string
	role: string
	date: string
	sortOrder: number
	accentColor: string
	summary: string
	icon: string
	heroImage: string
	isFeatured: boolean
	isDiscontinued: boolean
	sections: SectionItem[]
	links: LinkItem[]
}

export default function ProjectForm({ initialData }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } =
		useAdminResource<ProjectPayload>({
			resource: "projects",
			id: initialData?.id ?? null,
		})

	// Single state object so a partial-update setter (`setField`) can stand in
	// for the thirteen individual `useState` setters this form used to carry.
	// The callback identity is stable across renders so `SectionManager`,
	// `LinkManager`, and `ImageUpload` get the same `onChange` reference each
	// render — combine that with future `React.memo` on those children to skip
	// re-renders triggered by unrelated field edits.
	const [state, setState] = useState<FormState>({
		name: initialData?.name ?? "",
		platform: initialData?.platform ?? "",
		role: initialData?.role ?? "",
		date: initialData?.date ?? "",
		sortOrder: initialData?.sortOrder ?? 0,
		accentColor: initialData?.accentColor ?? "",
		summary: initialData?.summary ?? "",
		icon: initialData?.icon ?? "",
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
	})

	const setField = useCallback(
		<K extends keyof FormState>(field: K, value: FormState[K]) => {
			setState((prev) => ({ ...prev, [field]: value }))
		},
		[]
	)

	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault()

		await save({
			name: state.name,
			summary: state.summary,
			platform: state.platform,
			role: state.role || null,
			accentColor: state.accentColor || null,
			icon: state.icon || null,
			heroImage: state.heroImage || null,
			isFeatured: state.isFeatured,
			isDiscontinued: state.isDiscontinued,
			date: state.date || null,
			sortOrder: state.sortOrder,
			// Strip the client-only `_key` from sections, their nested images,
			// and links before sending.
			sections: state.sections.map(({ _key: _, images, ...rest }) => ({
				...rest,
				images: images.map(({ _key: __, ...imgRest }) => imgRest),
			})),
			links: state.links.map(({ _key: _, ...rest }) => rest),
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
					value={state.platform}
					onChange={(v) => setField("platform", v)}
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
					value={state.sortOrder}
					onChange={(e) => {
						// Empty input or partial entry ("-", ".") yields NaN; fall back to
						// 0 so the payload stays a valid number and downstream Zod doesn't
						// reject with a confusing "expected number, got null" message.
						const num = Number(e.target.value)
						setField("sortOrder", Number.isFinite(num) ? num : 0)
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
				<label className="text-secondary text-sm font-medium">Sections</label>
				<SectionManager
					value={state.sections}
					onChange={(v) => setField("sections", v)}
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Links</label>
				<LinkManager
					value={state.links}
					onChange={(v) => setField("links", v)}
				/>
			</div>

			{error && (
				<p className="text-sm text-red-500" role="alert">
					{error}
				</p>
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
