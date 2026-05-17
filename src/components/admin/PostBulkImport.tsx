"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import ErrorMessage from "@/components/admin/ErrorMessage"
import { parseBulkImportFilename } from "@/lib/bulkImportParser"
import { isAbortError } from "@/lib/isAbortError"
import { readErrorMessage } from "@/lib/readErrorMessage"
import { BULK_MAX_FILES } from "@/lib/schemas"
import { SECTIONS, type Section } from "@/lib/sections"

interface ParsedFile {
	file: File
	parse: ReturnType<typeof parseBulkImportFilename>
}

interface ImportResult {
	created: number
	skipped: Array<{ filename: string; reason: string }>
}

export default function PostBulkImport() {
	const router = useRouter()
	const [section, setSection] = useState<Section>("tech")
	const [files, setFiles] = useState<ParsedFile[]>([])
	const [truncatedCount, setTruncatedCount] = useState(0)
	const [isSubmitting, setIsSubmitting] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [result, setResult] = useState<ImportResult | null>(null)

	const isMountedRef = useRef(true)
	const abortRef = useRef<AbortController | null>(null)

	useEffect(() => {
		isMountedRef.current = true

		return () => {
			isMountedRef.current = false
			abortRef.current?.abort()
		}
	}, [])

	function handleFiles(list: FileList | null) {
		setError(null)
		setResult(null)

		if (!list || list.length === 0) {
			setFiles([])
			setTruncatedCount(0)
			return
		}

		const all = Array.from(list)
		const next = all
			.slice(0, BULK_MAX_FILES)
			.map((file) => ({ file, parse: parseBulkImportFilename(file.name) }))

		setFiles(next)
		// Visible signal when the selection was clipped, rather than silently
		// dropping anything past the cap. Admin can re-split the batch instead
		// of wondering why the result count is short.
		setTruncatedCount(Math.max(0, all.length - BULK_MAX_FILES))
	}

	const validCount = files.filter((entry) => entry.parse.ok).length
	const canSubmit = validCount > 0 && !isSubmitting

	async function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>) {
		event.preventDefault()

		if (!canSubmit) {
			return
		}

		setError(null)
		setResult(null)
		setIsSubmitting(true)

		const controller = new AbortController()
		abortRef.current?.abort()
		abortRef.current = controller

		try {
			// Read all file bodies in parallel. `File.text()` already returns a
			// promise resolving to UTF-8 decoded contents; no FileReader plumbing
			// needed.
			const payloadFiles = await Promise.all(
				files
					.filter((entry) => entry.parse.ok)
					.map(async (entry) => ({
						filename: entry.file.name,
						content: await entry.file.text(),
					}))
			)

			const response = await fetch("/api/admin/posts/bulk", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ section, files: payloadFiles }),
				signal: controller.signal,
			})

			if (!response.ok) {
				const message = await readErrorMessage(
					response,
					"Bulk import failed. Please try again."
				)
				throw new Error(message)
			}

			const data = (await response.json()) as ImportResult

			if (!isMountedRef.current) {
				return
			}

			setResult(data)
			setFiles([])
			setTruncatedCount(0)

			if (data.created > 0) {
				router.refresh()
			}
		} catch (err) {
			if (!isMountedRef.current || isAbortError(err)) {
				return
			}

			setError(
				err instanceof Error
					? err.message
					: "Bulk import failed. Please try again."
			)
		} finally {
			if (isMountedRef.current) {
				setIsSubmitting(false)
			}
		}
	}

	return (
		<form onSubmit={handleSubmit} className="flex flex-col gap-6">
			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="bulk-section"
					className="text-secondary text-sm font-medium"
				>
					Section
				</label>
				<select
					id="bulk-section"
					value={section}
					onChange={(e) => setSection(e.target.value as Section)}
					className="admin-input"
				>
					{SECTIONS.map((s) => (
						<option key={s} value={s}>
							{s}
						</option>
					))}
				</select>
			</div>

			<div className="flex flex-col gap-1.5">
				<label
					htmlFor="bulk-files"
					className="text-secondary text-sm font-medium"
				>
					Markdown files
				</label>
				<input
					id="bulk-files"
					type="file"
					accept=".md,text/markdown"
					multiple
					onChange={(e) => handleFiles(e.target.files)}
					className="text-primary file:bg-accent file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:text-white file:transition-opacity hover:file:opacity-80"
				/>
				<p className="text-secondary text-xs">
					Filename: <code>yyyy-MM-dd[-HHmm]-Title with spaces.md</code>. Up to{" "}
					{BULK_MAX_FILES} files per upload. Future-dated posts will be
					published automatically; past-dated posts saved as drafts.
				</p>
			</div>

			{truncatedCount > 0 && (
				<p className="text-xs text-amber-600 dark:text-amber-400">
					Selected {files.length + truncatedCount} files; importing the first{" "}
					{BULK_MAX_FILES}. Re-run with the remaining {truncatedCount} after
					this batch.
				</p>
			)}

			{files.length > 0 && (
				<div className="flex flex-col gap-2">
					<p className="text-secondary text-xs">
						{validCount} of {files.length} ready to import
					</p>
					<ul className="divide-border divide-y rounded-md border">
						{files.map((entry, index) => (
							<li
								// Composite key — two files with the same `name` from
								// different directories or selections must not reuse the
								// same React row, or the per-file parse result for one
								// could render against the other on subsequent edits.
								key={`${entry.file.name}-${index}-${entry.file.lastModified}`}
								className="flex items-start justify-between gap-3 px-3 py-2"
							>
								<div className="min-w-0">
									<p className="text-primary truncate font-mono text-xs">
										{entry.file.name}
									</p>
									{entry.parse.ok ? (
										<p className="text-secondary mt-0.5 text-xs">
											{entry.parse.title} · {entry.parse.datetime}
										</p>
									) : (
										<p className="mt-0.5 text-xs text-red-500">
											{entry.parse.reason}
										</p>
									)}
								</div>
							</li>
						))}
					</ul>
				</div>
			)}

			{error && <ErrorMessage>{error}</ErrorMessage>}

			{result && (
				<div className="flex flex-col gap-2 rounded-md border p-3">
					<p className="text-primary text-sm font-medium">
						Created {result.created} post{result.created === 1 ? "" : "s"}
					</p>
					{result.skipped.length > 0 && (
						<>
							<p className="text-secondary text-xs">
								Skipped {result.skipped.length}:
							</p>
							<ul className="text-secondary list-disc pl-5 text-xs">
								{result.skipped.map((item) => (
									<li key={item.filename}>
										<code>{item.filename}</code> — {item.reason}
									</li>
								))}
							</ul>
						</>
					)}
				</div>
			)}

			<div>
				<button
					type="submit"
					disabled={!canSubmit}
					className="bg-accent rounded-md px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{isSubmitting
						? "Importing…"
						: `Import ${validCount} file${validCount === 1 ? "" : "s"}`}
				</button>
			</div>
		</form>
	)
}
