// Safe, exhaustive deletion of every object under a storage prefix. Pure over a
// minimal storage interface so it is unit-testable and reusable.
//
// The bug it fixes: listing with a growing offset while deleting is UNSAFE —
// removing page 0 shrinks the collection, so offset=100 then skips objects. Here we
// always re-list at offset 0 and delete what comes back, until the prefix is empty.
// Folder/prefix entries (Supabase returns these with a null id) are recursed into,
// so nested user assets are actually removed. Everything is bounded so a
// misbehaving backend can never loop forever (it throws instead, surfacing the
// error to the caller rather than blocking account deletion indefinitely).

export interface StorageEntry {
  name: string;
  /** Supabase returns a null id for folder/prefix pseudo-entries, non-null for real objects. */
  id?: string | null;
}

export interface StorageListError {
  message: string;
}

export interface StorageLike {
  list(
    prefix: string,
    opts: { limit: number; offset: number },
  ): Promise<{ data: StorageEntry[] | null; error: StorageListError | null }>;
  remove(paths: string[]): Promise<{ error: StorageListError | null }>;
}

export interface PurgeOptions {
  pageSize?: number;
  /** Hard cap on list+delete iterations (safety against an unbounded backend). */
  maxIterations?: number;
}

/** Remove ALL objects under `prefix` (recursively). Returns how many were removed.
 *  Throws on a storage error or if the iteration cap is exceeded. */
export async function removeAllUnderPrefix(
  store: StorageLike,
  prefix: string,
  options: PurgeOptions = {},
): Promise<{ removed: number }> {
  const pageSize = options.pageSize ?? 100;
  const maxIterations = options.maxIterations ?? 100_000;

  let removed = 0;
  let iterations = 0;
  const queue: string[] = [prefix];
  const seenFolders = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift() as string;

    // Drain files directly under `current`. ALWAYS list at offset 0 — remove()
    // shrinks the collection, so any non-zero offset could skip entries.
    for (;;) {
      if (++iterations > maxIterations) {
        throw new Error("storage_purge_iteration_cap_exceeded");
      }
      const { data, error } = await store.list(current, { limit: pageSize, offset: 0 });
      if (error) throw new Error(error.message);
      const entries = data ?? [];
      if (entries.length === 0) break;

      // Queue folder/prefix entries (null id) to recurse into, once each.
      for (const e of entries) {
        if (e.name && (e.id === null || e.id === undefined)) {
          const sub = `${current}/${e.name}`;
          if (!seenFolders.has(sub)) {
            seenFolders.add(sub);
            queue.push(sub);
          }
        }
      }

      const filePaths = entries
        .filter((e) => e.name && e.id != null)
        .map((e) => `${current}/${e.name}`);

      // Only folder entries remain at this level (their files are removed when we
      // process the recursed prefix) — stop draining here.
      if (filePaths.length === 0) break;

      const { error: removeError } = await store.remove(filePaths);
      if (removeError) throw new Error(removeError.message);
      removed += filePaths.length;
    }
  }

  return { removed };
}
