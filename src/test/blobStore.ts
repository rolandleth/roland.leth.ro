import { vi } from "vitest"
import type { BlobListPage, BlobStore, ListedBlob } from "@/lib/import/blobSync"

/** The origin the fake store's `put` answers with. */
export const FAKE_STORE_ORIGIN = "https://store"

/**
 * In-memory `BlobStore` whose every method is a spy. Defaults: `list` returns
 * one empty page, `put` echoes a URL derived from the key, `del` resolves.
 */
export function makeStore(overrides: Partial<BlobStore> = {}): BlobStore {
	return {
		list: vi.fn(async (): Promise<BlobListPage> => ({
			blobs: [],
			hasMore: false,
		})),
		put: vi.fn(async (key: string) => ({
			url: `${FAKE_STORE_ORIGIN}/${key}`,
		})),
		del: vi.fn(async () => undefined),
		...overrides,
	}
}

/**
 * A fake store that holds `blobs`: `list` answers with the ones under the
 * prefix it is asked for, as the real store does. For code that lists more
 * than one prefix, where a single canned page would answer every call alike.
 */
export function makeStoreHolding(
	blobs: readonly ListedBlob[],
	overrides: Partial<BlobStore> = {}
): BlobStore {
	return makeStore({
		list: vi.fn(
			async ({ prefix }: { prefix: string }): Promise<BlobListPage> => ({
				blobs: blobs.filter((blob) => blob.pathname.startsWith(prefix)),
				hasMore: false,
			})
		),
		...overrides,
	})
}
