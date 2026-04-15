"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import ImageUpload from "@/components/admin/ImageUpload"
import LinkManager from "@/components/admin/LinkManager"
import PlatformPicker from "@/components/admin/PlatformPicker"
import SectionManager from "@/components/admin/SectionManager"

interface SectionImage {
	url: string
	caption: string
	sortOrder: number
}

interface SectionItem {
	title: string
	description: string
	sortOrder: number
	images: SectionImage[]
}

interface LinkItem {
	_key: string
	label: string
	url: string
	sortOrder: number
}

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
	sections: (SectionItem & {
		id?: number
		images: (SectionImage & { id?: number })[]
	})[]
	links: (Omit<LinkItem, "_key"> & { id?: number })[]
}

interface Props {
	initialData?: InitialData
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
	const router = useRouter()
	const isEditMode = initialData != null

	const [name, setName] = useState(initialData?.name ?? "")
	const [platform, setPlatform] = useState(initialData?.platform ?? "")
	const initialRoleValue = initialData?.role ?? ""
	const isRoleInitiallyFreeform =
		initialRoleValue !== "" && !ROLE_OPTIONS.includes(initialRoleValue)

	const [dropdownRole, setDropdownRole] = useState(
		isRoleInitiallyFreeform ? "" : initialRoleValue
	)
	const [freeformRole, setFreeformRole] = useState(
		isRoleInitiallyFreeform ? initialRoleValue : ""
	)
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
		initialData?.sections ?? []
	)
	const [links, setLinks] = useState<LinkItem[]>(
		(initialData?.links ?? []).map((link) => ({
			...link,
			_key: crypto.randomUUID(),
		}))
	)

	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
		e.preventDefault()
		setError(null)
		setIsSaving(true)

		const body = {
			name,
			summary,
			platform,
			role: freeformRole || dropdownRole || null,
			accentColor: accentColor || null,
			icon: icon || null,
			heroImage: heroImage || null,
			isFeatured,
			isDiscontinued,
			date: date || null,
			sortOrder,
			sections,
			// Strip the client-only _key before sending — the server schema doesn't know about it.
			links: links.map(({ _key: _, ...rest }) => rest),
		}

		try {
			const url = isEditMode
				? `/api/admin/projects/${initialData.id}`
				: "/api/admin/projects"
			const method = isEditMode ? "PUT" : "POST"

			const response = await fetch(url, {
				method,
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			})

			if (!response.ok) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Failed to save project")
			}

			router.push("/admin")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save project")
		} finally {
			setIsSaving(false)
		}
	}

	async function handleDelete() {
		if (!isEditMode) {
			return
		}

		if (!confirm(`Delete "${name}"? This cannot be undone.`)) {
			return
		}

		setError(null)

		try {
			const response = await fetch(`/api/admin/projects/${initialData.id}`, {
				method: "DELETE",
			})

			if (!response.ok && response.status !== 204) {
				const data = await response.json().catch(() => ({}))
				throw new Error(data.error ?? "Failed to delete project")
			}

			router.push("/admin")
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete project")
		}
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
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
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
				<div className="flex gap-2">
					<select
						id="role"
						value={dropdownRole}
						onChange={(e) => {
							if (e.target.value === "__freeform__") {
								setDropdownRole("")
							} else {
								setDropdownRole(e.target.value)
							}
						}}
						disabled={freeformRole !== ""}
						required={freeformRole === ""}
						className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
					>
						<option value="" disabled>
							Select a role…
						</option>
						{ROLE_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
						{dropdownRole !== "" && (
							<option value="__freeform__">Freeform…</option>
						)}
					</select>
					<input
						id="role-freeform"
						type="text"
						placeholder="or type freely…"
						value={freeformRole}
						onChange={(e) => setFreeformRole(e.target.value)}
						disabled={dropdownRole !== ""}
						className="border-border bg-background text-primary focus:border-accent min-w-0 flex-1 rounded-md border px-3 py-2 text-sm transition-colors outline-none disabled:opacity-40"
					/>
				</div>
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
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
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
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
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
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
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
					className="border-border bg-background text-primary focus:border-accent rounded-md border px-3 py-2 text-sm transition-colors outline-none"
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
					disabled={isSaving}
					className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSaving ? "Saving…" : "Save project"}
				</button>

				{isEditMode && (
					<button
						type="button"
						onClick={handleDelete}
						className="rounded-md px-4 py-2 text-sm font-medium text-red-500 transition-opacity hover:opacity-75"
					>
						Delete
					</button>
				)}
			</div>
		</form>
	)
}
