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
// Targets prod by running with prod credentials in the environment (DATABASE_URL
// + BLOB_READ_WRITE_TOKEN, e.g. via `vercel env pull`). Always `--dry-run` first.
//
// The mechanical half only: it transforms whatever the manifest says. Authoring
// the manifest from marketing copy is the `app-copy-to-project` skill's job.

import "dotenv/config"
import { readdir, readFile, rm } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { PrismaPg } from "@prisma/adapter-pg"
import {
	BlobAccessError,
	BlobStoreNotFoundError,
	BlobStoreSuspendedError,
	del,
	list,
	put,
} from "@vercel/blob"
import { ZodError } from "zod"
import { PrismaClient } from "@/generated/prisma/client"
import { projectCreateSchema } from "@/lib/api/schemas"
import { toLinkCreate, toSectionCreate } from "@/lib/db/projectMappers"
import {
	type BlobStore,
	formatBytes,
	listProjectBlobs,
	type LoadedImage,
	pruneOrphans,
	type StoredBlob,
	syncImages,
} from "@/lib/import/blobSync"
import {
	blobKeyFor,
	contentHashFor,
	deriveSlug,
	listManifestImagePaths,
	type ProjectManifest,
	resolveManifestImageRefs,
	syntheticBlobUrl,
} from "@/lib/import/projectImport"

const SCRIPTS_DIR = path.dirname(fileURLToPath(import.meta.url))
const IMPORTS_DIR = path.join(SCRIPTS_DIR, "imports")
const MANIFEST_FILENAME = "project.json"
const KNOWN_FLAGS = new Set([
	"--dry-run",
	"--cleanup",
	"--reupload",
	"--no-prune",
])

type ProjectResult = {
	name: string
	status: "imported" | "validated" | "failed"
	detail?: string
}

// #region CLI

const argv = process.argv.slice(2)
const isDryRun = argv.includes("--dry-run")
const shouldCleanup = argv.includes("--cleanup")
const isReupload = argv.includes("--reupload")
const isPruneDisabled = argv.includes("--no-prune")
const slugFilters = argv.filter((arg) => !arg.startsWith("--"))
const unknownFlags = argv.filter(
	(arg) => arg.startsWith("--") && !KNOWN_FLAGS.has(arg)
)

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
		} catch {
			throw new Error(`Image not found: ${relativePath}`)
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

		const message = error instanceof Error ? error.message : String(error)
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

function makePrisma(): PrismaClient {
	const connectionString = process.env.DATABASE_URL

	if (connectionString == null || connectionString === "") {
		throw new Error(
			"DATABASE_URL is not set. Provide DB credentials before importing (e.g. `vercel env pull`)."
		)
	}

	return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

/**
 * Replaces the project at `slug` wholesale: delete-then-create inside a
 * transaction so a re-import fully refreshes it. The cascade on the relations
 * removes the old sections/images/links; without the delete, the create would
 * trip the unique `slug` constraint.
 */
async function writeProject(
	prisma: PrismaClient,
	slug: string,
	data: ReturnType<typeof projectCreateSchema.parse>
): Promise<void> {
	await prisma.$transaction(async (tx) => {
		await tx.project.deleteMany({ where: { slug } })
		await tx.project.create({
			data: {
				name: data.name,
				slug,
				summary: data.summary,
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
				// Fall back to the first section's first image when no hero is set, so a
				// hero-less project still gets a banner in the gallery instead of an
				// empty card.
				heroImage:
					data.heroImage ?? data.sections?.[0]?.images?.[0]?.url ?? null,
				isFeatured: data.isFeatured ?? false,
				isDiscontinued: data.isDiscontinued ?? false,
				date: data.date ?? null,
				// Imports honour the authored `sortOrder` verbatim — unlike the
				// admin create route, which shifts siblings to make room. The
				// manifest author owns gallery ordering across the whole batch.
				sortOrder: data.sortOrder ?? 0,
				sections: toSectionCreate(data.sections),
				links: toLinkCreate(data.links),
			},
		})
	})
}

// #endregion

// #region per-project pipeline

async function readManifest(manifestPath: string): Promise<ProjectManifest> {
	let raw: string

	try {
		raw = await readFile(manifestPath, "utf8")
	} catch {
		throw new Error(
			`No ${MANIFEST_FILENAME} at ${path.relative(process.cwd(), manifestPath)}.`
		)
	}

	try {
		return JSON.parse(raw) as ProjectManifest
	} catch (error) {
		throw new Error(
			`Invalid JSON in ${MANIFEST_FILENAME}: ${(error as Error).message}`
		)
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

		const slug = deriveSlug(manifest.name, manifest.slug)
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
			`  ${imagePaths.length} image(s), ${manifest.sections?.length ?? 0} section(s), ${manifest.links?.length ?? 0} link(s)`
		)

		if (isDryRun) {
			for (const relativePath of imagePaths) {
				const image = loaded.get(relativePath)!
				console.log(
					`  · ${relativePath} → ${image.key} (${formatBytes(image.size)})`
				)
			}
			console.log(`  ✓ valid — nothing written (dry run)`)

			return { name: manifest.name, status: "validated" }
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
		await writeProject(prisma!, slug, data)
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
				const message = error instanceof Error ? error.message : String(error)
				console.warn(
					`  ! couldn't prune orphaned blobs for ${slug} (${message}); they remain in the store`
				)
			}
		}

		if (shouldCleanup) {
			await rm(projectDir, { recursive: true, force: true })
			console.log(`  · cleaned up ${path.relative(process.cwd(), projectDir)}`)
		}

		return { name: manifest.name, status: "imported" }
	} catch (error) {
		console.error(`  ✗ ${folderName}: ${formatError(error)}`)

		return { name: folderName, status: "failed", detail: formatError(error) }
	}
}

// #endregion

// #region helpers

/**
 * Lists the project folders to process: every direct subdirectory of
 * `scripts/imports/` that the optional name filters allow. Warns about a filter
 * that matches nothing so a typo doesn't look like a silent no-op.
 */
async function discoverProjectDirs(filters: string[]): Promise<string[]> {
	let entries

	try {
		entries = await readdir(IMPORTS_DIR, { withFileTypes: true })
	} catch {
		console.error(
			`No staging directory at ${path.relative(process.cwd(), IMPORTS_DIR)}. ` +
				`Create scripts/imports/<name>/ with a ${MANIFEST_FILENAME}.`
		)

		return []
	}

	const folderNames = entries
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name)

	for (const filter of filters) {
		if (!folderNames.includes(filter)) {
			console.warn(`No import folder named "${filter}" under scripts/imports/.`)
		}
	}

	const selected =
		filters.length > 0
			? folderNames.filter((name) => filters.includes(name))
			: folderNames

	return selected.sort().map((name) => path.join(IMPORTS_DIR, name))
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

	return error instanceof Error ? error.message : String(error)
}

// #endregion

// #region main

async function main(): Promise<void> {
	if (unknownFlags.length > 0) {
		// Derived from the same set the parser checks, so the help text can't
		// drift from the flags actually honoured.
		console.error(
			`Unknown flag(s): ${unknownFlags.join(", ")}. Supported: ${[...KNOWN_FLAGS].join(", ")}.`
		)
		process.exitCode = 1

		return
	}

	if (!isDryRun && process.env.BLOB_READ_WRITE_TOKEN == null) {
		console.error(
			"BLOB_READ_WRITE_TOKEN is not set — image upload would fail. " +
				"Provide credentials (e.g. `vercel env pull`), or use --dry-run."
		)
		process.exitCode = 1

		return
	}

	console.log(
		`${isDryRun ? "DRY RUN — " : ""}importing from ${path.relative(process.cwd(), IMPORTS_DIR)}` +
			(slugFilters.length > 0 ? ` (filter: ${slugFilters.join(", ")})` : "")
	)

	const projectDirs = await discoverProjectDirs(slugFilters)

	if (projectDirs.length === 0) {
		console.error("Nothing to import.")
		process.exitCode = 1

		return
	}

	const prisma = isDryRun ? null : makePrisma()
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

	if (failed.length > 0) {
		process.exitCode = 1
	}
}

main().catch((error) => {
	console.error(formatError(error))
	process.exit(1)
})

// #endregion
