import { vi } from "vitest"
import type { BlobListPage, BlobStore } from "@/lib/import/blobSync"

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
