// Project-agnostic importer: turns `scripts/imports/<name>/project.json` (+ its
// staged image files) into a live project on whatever DB `DATABASE_URL` points
// at, uploading every local image to Vercel Blob first.
//
//   yarn db:import-projects                 # import every folder under scripts/imports/
//   yarn db:import-projects reckon          # only the `reckon` folder
//   yarn db:import-projects --dry-run       # validate manifest + images, write nothing
//   yarn db:import-projects reckon --cleanup # delete the staged folder after success
//   yarn db:import-projects reckon --reupload # re-upload images even if already in Blob
//   yarn db:import-projects reckon --no-prune # keep orphaned blobs after import
//
// Blob keys are content-addressed, so a key that already exists in the store
// holds the same bytes and is reused, not re-uploaded (byte size is checked on
// reuse as a hash-collision backstop) — a prod run after a local-DB test pass
// doesn't re-push the same files. After a successful import, blobs under the
// project's prefix that the new rows no longer reference (old keys of edited
// images, strays from failed runs) are pruned unless `--no-prune` is passed.
//
// Targets prod by running with prod credentials (DATABASE_URL +
// BLOB_READ_WRITE_TOKEN) in `.env`, the one file the scripts load; see
// `SCRIPT_CREDENTIALS_HINT`. Always `--dry-run` first.
//
// The mechanical half only: it transforms whatever the manifest says. Authoring
// the manifest from marketing copy is the `app-copy-to-project` skill's job.

import "dotenv/config"
import { readdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
	BlobAccessError,
	BlobStoreNotFoundError,
	BlobStoreSuspendedError,
	del,
	list,
	put,
} from "@vercel/blob"
import { ZodError } from "zod"
import { Prisma, PrismaClient } from "@/generated/prisma/client"
import { projectCreateSchema } from "@/lib/api/schemas"
import {
	toFaqCreate,
	toLinkCreate,
	toSectionCreate,
} from "@/lib/db/projectMappers"
import { makeScriptPrisma } from "@/lib/db/scriptPrisma"
import {
	type BlobStore,
	formatBytes,
	listProjectBlobs,
	type LoadedImage,
	pruneOrphans,
	type StoredBlob,
	syncImages,
} from "@/lib/import/blobSync"
import { parseScriptArgs } from "@/lib/import/cliArgs"
import { isMissingPathError } from "@/lib/import/fsErrors"
import {
	blobKeyFor,
	contentHashFor,
	listManifestImagePaths,
	parseManifest,
	type ProjectFlags,
	projectFlags,
	type ProjectManifest,
	requireManifestSlug,
	resolveManifestImageRefs,
	selectProjectFolders,
	syntheticBlobUrl,
} from "@/lib/import/projectImport"
import { readScriptEnv, SCRIPT_CREDENTIALS_HINT } from "@/lib/import/scriptEnv"
import { errorMessage } from "@/lib/utils/errorMessage"

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const IMPORTS_DIR = path.join(SCRIPTS_DIR, "imports")
const MANIFEST_FILENAME = "project.json"

type ProjectResult = {
	name: string
	status: "imported" | "validated" | "failed"
	detail?: string
	// The manifest's slug (= the `/projects/<slug>` last path component). Absent
	// when a run fails before the slug is checked. Used to print the paste-ready
	// revalidation list.
	slug?: string
}

// #region CLI

const cli = parseScriptArgs(process.argv.slice(2), {
	command: "yarn db:import-projects",
	positionals: { count: "any", name: "name" },
	knownFlags: new Set(["--dry-run", "--cleanup", "--reupload", "--no-prune"]),
})
const { flags, positionals: slugFilters } = cli
const isDryRun = flags.has("--dry-run")
const shouldCleanup = flags.has("--cleanup")
const isReupload = flags.has("--reupload")
const isPruneDisabled = flags.has("--no-prune")

// #endregion

// #region image I/O

/**
 * Reads every local image the manifest references, keyed by its
 * manifest-relative path, and computes its content-addressed blob key. Uploads
 * nothing — used by the dry-run report and the real run's pre-upload step, so a
 * missing image fails before any Blob write. These are trusted, first-party
 * staged files, so there's no MIME/size gate (the admin upload route has one
 * because it accepts untrusted network uploads; this doesn't). A path resolving
 * outside the project folder is still rejected — that's a manifest typo, not an
 * attack.
 */
async function loadImages(
	projectDir: string,
	slug: string,
	imagePaths: string[]
): Promise<Map<string, LoadedImage>> {
	const loaded = new Map<string, LoadedImage>()
	const dirPrefix = path.resolve(projectDir) + path.sep

	for (const relativePath of imagePaths) {
		const absolutePath = path.resolve(projectDir, relativePath)

		if (!absolutePath.startsWith(dirPrefix)) {
			throw new Error(
				`Image path "${relativePath}" escapes the project folder.`
			)
		}

		let buffer: Buffer

		try {
			buffer = await readFile(absolutePath)
		} catch (error) {
			// Only a missing file is "not found"; a permission error or a folder at
			// that path is reported as it is.
			if (isMissingPathError(error)) {
				throw new Error(`Image not found: ${relativePath}`)
			}

			throw new Error(
				`Could not read image ${relativePath}: ${errorMessage(error)}`
			)
		}

		// Content-addressed key: hashing the bytes means a changed image lands at
		// a brand-new URL the CDN has never cached (a clean miss), sidestepping
		// the "overwrite still serves the stale copy" problem; identical bytes
		// resolve to the same key and get reused.
		loaded.set(relativePath, {
			buffer,
			size: buffer.length,
			key: blobKeyFor(slug, relativePath, contentHashFor(buffer)),
		})
	}

	return loaded
}

// The real-SDK adapter behind `BlobStore`. SDK-specific knobs live here:
// content-type is inferred by Blob from the key's extension (`.png`, …), and
// `allowOverwrite` stays on because a `put` can legitimately target an
// existing key — `--reupload`, and the fail-open "treat nothing as existing"
// path after a transient `list` failure — where the content-addressed key
// guarantees identical bytes anyway. Collisions are guarded on the reuse path
// (size assert in `syncImages`), not here.
const blobStore: BlobStore = {
	list: (options) => list(options),
	put: async (key, body) => {
		return put(key, Buffer.isBuffer(body) ? body : Buffer.from(body), {
			access: "public",
			addRandomSuffix: false,
			allowOverwrite: true,
		})
	},
	del: (urls) => del(urls),
}

/**
 * True for Blob errors that mean the store or token is misconfigured rather
 * than transiently unavailable. These must fail the import loudly: downgrading
 * them to "treat nothing as existing" would re-upload an entire gallery on
 * prod while hiding the misconfiguration.
 */
function isBlobConfigError(error: unknown): boolean {
	return (
		error instanceof BlobAccessError ||
		error instanceof BlobStoreNotFoundError ||
		error instanceof BlobStoreSuspendedError
	)
}

/**
 * Lists the blobs already stored under a project's key prefix so existing
 * images can be reused instead of re-uploaded. Only a transient `list` failure
 * (network blip, service hiccup) is downgraded to a warning and treated as
 * "nothing exists" — the import then uploads everything, which the adapter's
 * `allowOverwrite` makes safe rather than fatal. Credential/store
 * misconfiguration rethrows and fails the project.
 */
async function listExistingBlobs(
	slug: string
): Promise<Map<string, StoredBlob>> {
	try {
		return await listProjectBlobs(blobStore, slug)
	} catch (error) {
		if (isBlobConfigError(error)) {
			throw error
		}

		const message = errorMessage(error)
		console.warn(
			`  ! couldn't list existing blobs for ${slug} (${message}); uploading all`
		)

		return new Map()
	}
}

/**
 * Resolves each image to a public Blob URL via `syncImages` — reusing
 * content-addressed keys already in the store, uploading the rest with bounded
 * concurrency. `--reupload` skips the existing-blob lookup so everything
 * uploads fresh.
 */
async function resolveImageUrls(
	slug: string,
	imagePaths: string[],
	loaded: Map<string, LoadedImage>,
	reupload: boolean
): Promise<Map<string, string>> {
	const existing = reupload
		? new Map<string, StoredBlob>()
		: await listExistingBlobs(slug)

	return syncImages(blobStore, imagePaths, loaded, existing, console.log)
}

/**
 * Collects every image URL the validated project data references — icon,
 * cardImage, ogImage, hero, and section images — i.e. the set of blobs that
 * must survive the post-import orphan sweep. Omitting one here deletes a
 * freshly-uploaded blob as "orphaned".
 */
function referencedImageUrls(
	data: ReturnType<typeof projectCreateSchema.parse>
): Set<string> {
	const urls = new Set<string>()
	const add = (value: string | null | undefined): void => {
		if (value != null && value !== "") {
			urls.add(value)
		}
	}

	add(data.icon)
	add(data.cardImage)
	add(data.ogImage)
	add(data.heroImage)

	for (const section of data.sections ?? []) {
		for (const image of section.images ?? []) {
			add(image.url)
		}
	}

	return urls
}

// #endregion

// #region DB

/**
 * Replaces the project at `slug` wholesale: delete-then-create inside a
 * transaction so a re-import fully refreshes it. The cascade on the relations
 * removes the old sections/images/links; without the delete, the create would
 * trip the unique `slug` constraint.
 */
async function writeProject(
	prisma: PrismaClient,
	slug: string,
	// The flags come from `parseManifest`, typed as booleans: the schema leaves
	// them optional, and a `?? false` here would read as a default the import
	// doesn't have.
	data: ReturnType<typeof projectCreateSchema.parse> & ProjectFlags
): Promise<void> {
	// Serializable matches the API routes (`POST /api/admin/projects` and `PUT
	// /api/admin/projects/:id`) so a concurrent admin edit can't slip a
	// non-repeatable read between this script's delete-and-create on the same
	// slug.
	//
	// No retry/backoff — same rationale as the admin routes: a single-admin
	// site sees write conflicts (`P2034`) only if the operator edits in the UI
	// mid-import, and re-running the import is the recovery. The tradeoff: the
	// Blob uploads in `resolveImageUrls` happen *before* this transaction, so an
	// abort leaves those blobs orphaned until a later run's `pruneOrphans`
	// sweeps them — acceptable dead weight, not data loss. `processProject`
	// logs `P2034` distinctly so a conflict isn't mistaken for a manifest typo.
	await prisma.$transaction(
		async (tx) => {
			await tx.project.deleteMany({ where: { slug } })
			await tx.project.create({
				data: {
					name: data.name,
					slug,
					summary: data.summary,
					metaTitle: data.metaTitle ?? null,
					keywords: data.keywords ?? [],
					// Nullable Json column: a bare `null` is reserved by Prisma for JSON
					// filters, so the absent case writes SQL NULL via `Prisma.DbNull`.
					offers: data.offers ?? Prisma.DbNull,
					applicationCategory: data.applicationCategory ?? null,
					bucket: data.bucket,
					platformTags: data.platformTags,
					role: data.role ?? null,
					accentColor: data.accentColor ?? null,
					icon: data.icon ?? null,
					// Card and OG images, stored as authored. The card and OG tag resolve
					// their fallbacks (`resolveCardImage` / `resolveOgImage`) at render
					// time, so nothing is baked in here.
					cardImage: data.cardImage ?? null,
					ogImage: data.ogImage ?? null,
					// Stored as authored — no first-image backfill. `heroImage` is the
					// detail-page hero (used only when a project has no sections), and the
					// card/OG resolvers (`resolveCardImage` / `resolveOgImage`) already
					// fall through to the first section image at render time, so a null
					// hero never yields an empty card.
					heroImage: data.heroImage ?? null,
					isFeatured: data.isFeatured,
					isDiscontinued: data.isDiscontinued,
					isOwnApp: data.isOwnApp,
					date: data.date ?? null,
					// Imports honour the authored `sortOrder` verbatim — unlike the
					// admin create route, which shifts siblings to make room. The
					// manifest author owns gallery ordering across the whole batch.
					sortOrder: data.sortOrder ?? 0,
					sections: toSectionCreate(data.sections),
					links: toLinkCreate(data.links),
					faqs: toFaqCreate(data.faqs),
				},
			})
		},
		{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
	)
}

// #endregion

// #region per-project pipeline

/**
 * Reads a manifest through `parseManifest`, so the required-flags check runs
 * before anything else in `processProject`, dry runs included.
 */
async function readManifest(
	manifestPath: string
): Promise<ProjectManifest & ProjectFlags> {
	let raw: string

	try {
		raw = await readFile(manifestPath, "utf8")
	} catch (error) {
		const relativePath = path.relative(process.cwd(), manifestPath)

		// Same split as the image read: only a missing file means "no manifest".
		if (isMissingPathError(error)) {
			throw new Error(`No ${MANIFEST_FILENAME} at ${relativePath}.`)
		}

		throw new Error(`Could not read ${relativePath}: ${errorMessage(error)}`)
	}

	try {
		return parseManifest(raw)
	} catch (error) {
		throw new Error(`${MANIFEST_FILENAME}: ${errorMessage(error)}`)
	}
}

async function processProject(
	projectDir: string,
	prisma: PrismaClient | null
): Promise<ProjectResult> {
	const folderName = path.basename(projectDir)

	try {
		const manifest = await readManifest(
			path.join(projectDir, MANIFEST_FILENAME)
		)

		if (typeof manifest.name !== "string" || manifest.name.trim() === "") {
			throw new Error(`Manifest is missing a non-empty "name".`)
		}

		const slug = requireManifestSlug(manifest)
		console.log(`\n▸ ${manifest.name}  (slug: ${slug})`)

		// Validate the full manifest against the real schema BEFORE any upload,
		// substituting synthetic URLs for the not-yet-uploaded images so the
		// `http(s)`-URL checks pass. Catches a bad bucket/tag combo, an
		// over-long summary, etc. while it's still cheap to bail.
		const validationManifest = resolveManifestImageRefs(manifest, (localPath) =>
			syntheticBlobUrl(slug, localPath)
		)
		projectCreateSchema.parse(validationManifest)

		const imagePaths = listManifestImagePaths(manifest)
		const loaded = await loadImages(projectDir, slug, imagePaths)

		console.log(
			`  ${imagePaths.length} image(s), ${manifest.sections?.length ?? 0} section(s), ${manifest.links?.length ?? 0} link(s), ${manifest.faqs?.length ?? 0} FAQ(s)`
		)

		if (isDryRun) {
			for (const relativePath of imagePaths) {
				const image = loaded.get(relativePath)!
				console.log(
					`  · ${relativePath} → ${image.key} (${formatBytes(image.size)})`
				)
			}
			console.log(`  ✓ valid — nothing written (dry run)`)

			return { name: manifest.name, slug, status: "validated" }
		}

		const urlByPath = await resolveImageUrls(
			slug,
			imagePaths,
			loaded,
			isReupload
		)
		const resolved = resolveManifestImageRefs(manifest, (localPath) => {
			const url = urlByPath.get(localPath)

			if (url == null) {
				throw new Error(`No uploaded URL for ${localPath}`)
			}

			return url
		})
		// Re-validate with the real Blob URLs in place, then persist.
		const data = projectCreateSchema.parse(resolved)

		// The dry-run branch above already returned, so a live run always has a
		// client. Guard explicitly (rather than `prisma!`) so a future reorder or
		// added early-exit can't silently pass null into the transaction.
		if (prisma === null) {
			throw new Error("No database client for a non-dry-run import")
		}

		await writeProject(prisma, slug, { ...data, ...projectFlags(manifest) })
		console.log(`  ✓ imported "${manifest.name}"`)

		if (!isPruneDisabled) {
			// Only after a successful write: blobs the new rows no longer
			// reference (old keys of edited images, legacy non-content-addressed
			// keys, strays from runs whose DB write failed) are otherwise
			// permanent dead weight on the 1 GB free tier. A failed sweep warns
			// but doesn't fail the import — the rows are already live.
			try {
				const pruned = await pruneOrphans(
					blobStore,
					slug,
					referencedImageUrls(data),
					console.log
				)

				if (pruned > 0) {
					console.log(`  · pruned ${pruned} orphaned blob(s)`)
				}
			} catch (error) {
				const message = errorMessage(error)
				console.warn(
					`  ! couldn't prune orphaned blobs for ${slug} (${message}); they remain in the store`
				)
			}
		}

		if (shouldCleanup) {
			await rm(projectDir, { recursive: true, force: true })
			console.log(`  · cleaned up ${path.relative(process.cwd(), projectDir)}`)
		}

		return { name: manifest.name, slug, status: "imported" }
	} catch (error) {
		const result = toFailureResult(folderName, error)
		console.error(`  ✗ ${folderName}: ${result.detail}`)

		return result
	}
}

/**
 * Classifies a caught import error into a failure result. A Serializable write
 * conflict (`P2034`, a concurrent admin edit on the same slug) gets a distinct,
 * actionable message so a real batch conflict isn't triaged as a manifest typo —
 * the fix is to re-run, not to edit the manifest. Any blobs uploaded before the
 * abort are swept by a later run's `pruneOrphans`. Everything else flattens
 * through `formatError`.
 */
function toFailureResult(folderName: string, error: unknown): ProjectResult {
	if (
		error instanceof Prisma.PrismaClientKnownRequestError &&
		error.code === "P2034"
	) {
		return {
			name: folderName,
			status: "failed",
			detail:
				"transaction aborted (P2034 write conflict) — re-run the import for this project",
		}
	}

	return { name: folderName, status: "failed", detail: formatError(error) }
}

// #endregion

// #region helpers

/**
 * Lists the project folders to process: the direct subdirectories of
 * `scripts/imports/` that `selectProjectFolders` picks. Returns `null`, after
 * logging why, when the staging directory can't be read or any filter matches
 * no folder.
 */
async function discoverProjectDirs(
	filters: string[]
): Promise<string[] | null> {
	let entries

	try {
		entries = await readdir(IMPORTS_DIR, { withFileTypes: true })
	} catch (error) {
		const relativeDir = path.relative(process.cwd(), IMPORTS_DIR)

		// Only a missing folder means "nothing staged yet"; anything else (a
		// permission error, a file where the folder should be) is reported as it
		// is, or the fix would be looked for in the wrong place.
		if (isMissingPathError(error)) {
			console.error(
				`No staging directory at ${relativeDir}. ` +
					`Create scripts/imports/<name>/ with a ${MANIFEST_FILENAME}.`
			)
		} else {
			console.error(
				`Could not read the staging directory ${relativeDir}: ${errorMessage(error)}`
			)
		}

		return null
	}

	const folderNames = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)
	const selection = selectProjectFolders(folderNames, filters)

	if ("missing" in selection) {
		const quoted = selection.missing
			.map((name) => JSON.stringify(name))
			.join(", ")
		console.error(
			`No import folder named ${quoted} under scripts/imports/. Nothing was imported.`
		)

		return null
	}

	return selection.selected.map((name) => path.join(IMPORTS_DIR, name))
}

function formatError(error: unknown): string {
	if (error instanceof ZodError) {
		const issues = error.issues
			.map(
				(issue) =>
					`      - ${issue.path.join(".") || "(root)"}: ${issue.message}`
			)
			.join("\n")

		return `validation failed:\n${issues}`
	}

	return errorMessage(error)
}

// #endregion

// #region main

async function main(): Promise<void> {
	if (cli.problem != null) {
		console.error(cli.problem)
		process.exitCode = 1

		return
	}

	if (!isDryRun && readScriptEnv("BLOB_READ_WRITE_TOKEN") == null) {
		console.error(
			"BLOB_READ_WRITE_TOKEN is not set — image upload would fail. " +
				`${SCRIPT_CREDENTIALS_HINT} Or use --dry-run.`
		)
		process.exitCode = 1

		return
	}

	console.log(
		`${isDryRun ? "DRY RUN — " : ""}importing from ${path.relative(process.cwd(), IMPORTS_DIR)}` +
			(slugFilters.length > 0 ? ` (filter: ${slugFilters.join(", ")})` : "")
	)

	const projectDirs = await discoverProjectDirs(slugFilters)

	if (projectDirs == null) {
		process.exitCode = 1

		return
	}

	if (projectDirs.length === 0) {
		console.error("Nothing to import.")
		process.exitCode = 1

		return
	}

	const prisma = isDryRun ? null : makeScriptPrisma()
	const results: ProjectResult[] = []

	try {
		for (const projectDir of projectDirs) {
			results.push(await processProject(projectDir, prisma))
		}
	} finally {
		await prisma?.$disconnect()
	}

	const imported = results.filter((result) => result.status === "imported")
	const validated = results.filter((result) => result.status === "validated")
	const failed = results.filter((result) => result.status === "failed")

	const headline = isDryRun ? "Dry run" : "Import"
	const tally = isDryRun
		? `${validated.length} validated`
		: `${imported.length} imported`

	console.log(`\n${headline} complete: ${tally}, ${failed.length} failed.`)

	// Script writes bypass the app, so `unstable_cache` tags aren't busted. Print
	// the imported slugs so they paste straight into the admin dashboard's
	// Revalidate panel ("Revalidate listed" for projects).
	const changedSlugs = imported
		.map((result) => result.slug)
		.filter((slug): slug is string => slug != null)

	if (changedSlugs.length > 0) {
		console.log(
			"\nChanged projects (paste into the admin dashboard's Revalidate panel):"
		)
		console.log(changedSlugs.join(", "))
	}

	if (failed.length > 0) {
		process.exitCode = 1
	}
}

main().catch((error) => {
	console.error(formatError(error))
	process.exit(1)
})

// #endregion
