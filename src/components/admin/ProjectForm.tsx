"use client"

import { useState } from "react"
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
	sections: (Omit<SectionItem, "_key"> & {
		id?: number
		images: (SectionImage & { id?: number })[]
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
	sections: Omit<SectionItem, "_key">[]
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

export default function ProjectForm({ initialData }: Props) {
	const isEditing = initialData != null
	const { save, remove, isSubmitting, error } =
		useAdminResource<ProjectPayload>({
			resource: "projects",
			id: initialData?.id ?? null,
		})

	const [name, setName] = useState(initialData?.name ?? "")
	const [platform, setPlatform] = useState(initialData?.platform ?? "")
	const [role, setRole] = useState(initialData?.role ?? "")
	const [date, setDate] = useState(initialData?.date ?? "")
	const [sortOrder, setSortOrder] = useState(initialData?.sortOrder ?? 0)
	const [accentColor, setAccentColor] = useState(initialData?.accentColor ?? "")
	const [summary, setSummary] = useState(initialData?.summary ?? "")
	const [icon, setIcon] = useState(initialData?.icon ?? "")
	const [heroImage, setHeroImage] = useState(initialData?.heroImage ?? "")
	const [isFeatured, setIsFeatured] = useState(initialData?.isFeatured ?? false)
	const [isDiscontinued, setIsDiscontinued] = useState(
		initialData?.isDiscontinued ?? false
	)
	const [sections, setSections] = useState<SectionItem[]>(
		(initialData?.sections ?? []).map((section) => ({
			...section,
			_key: crypto.randomUUID(),
		}))
	)
	const [links, setLinks] = useState<LinkItem[]>(
		(initialData?.links ?? []).map((link) => ({
			...link,
			_key: crypto.randomUUID(),
		}))
	)

	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault()

		await save({
			name,
			summary,
			platform,
			role: role || null,
			accentColor: accentColor || null,
			icon: icon || null,
			heroImage: heroImage || null,
			isFeatured,
			isDiscontinued,
			date: date || null,
			sortOrder,
			// Strip the client-only `_key` from sections and links before sending.
			sections: sections.map(({ _key: _, ...rest }) => rest),
			links: links.map(({ _key: _, ...rest }) => rest),
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
					value={name}
					onChange={(e) => setName(e.target.value)}
					required
					className="admin-input"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-secondary text-sm font-medium">Platform</span>
				<PlatformPicker value={platform} onChange={setPlatform} />
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="role" className="text-secondary text-sm font-medium">
					Role
				</label>
				<PresetOrFreeformInput
					id="role"
					value={role}
					onChange={setRole}
					presets={ROLE_OPTIONS}
					presetLabel="Select a role…"
				/>
			</div>

			<div className="flex flex-col gap-1.5">
				<label htmlFor="date" className="text-secondary text-sm font-medium">
					Date
				</label>
				<input
					id="date"
					type="text"
					value={date}
					onChange={(e) => setDate(e.target.value)}
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
					value={sortOrder}
					onChange={(e) => setSortOrder(Number(e.target.value))}
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
					value={accentColor}
					onChange={(e) => setAccentColor(e.target.value)}
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
					value={summary}
					onChange={(e) => setSummary(e.target.value)}
					required
					rows={4}
					className="admin-input"
				/>
			</div>

			<ImageUpload value={icon} onChange={setIcon} label="Icon URL" />
			<ImageUpload
				value={heroImage}
				onChange={setHeroImage}
				label="Hero image URL"
			/>

			<div className="flex gap-6">
				<label className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={isFeatured}
						onChange={(e) => setIsFeatured(e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-secondary text-sm font-medium">Featured</span>
				</label>

				<label className="flex cursor-pointer items-center gap-2">
					<input
						type="checkbox"
						checked={isDiscontinued}
						onChange={(e) => setIsDiscontinued(e.target.checked)}
						className="accent-accent h-4 w-4"
					/>
					<span className="text-secondary text-sm font-medium">
						Discontinued
					</span>
				</label>
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Sections</label>
				<SectionManager value={sections} onChange={setSections} />
			</div>

			<div className="flex flex-col gap-1.5">
				<label className="text-secondary text-sm font-medium">Links</label>
				<LinkManager value={links} onChange={setLinks} />
			</div>

			{error && <p className="text-sm text-red-500">{error}</p>}

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
