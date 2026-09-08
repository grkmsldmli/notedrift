// Exhaustive-deletion helper. Proves that deleting >1 page of objects never skips
// entries (the offset-shrink bug) and that nested folders are fully removed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { removeAllUnderPrefix, type StorageEntry, type StorageLike } from "./purge.ts";

/** In-memory storage backed by a set of FULL object paths. `list(prefix)` returns
 *  the immediate children (real files carry an id; sub-prefixes carry id=null),
 *  faithfully mirroring Supabase Storage semantics. */
function makeStore(objectPaths: string[]) {
  const objects = new Set(objectPaths);
  const removed: string[] = [];
  const listOffsets: number[] = [];

  const store: StorageLike = {
    async list(prefix, { limit, offset }) {
      listOffsets.push(offset);
      const base = prefix.endsWith("/") ? prefix : `${prefix}/`;
      const files = new Set<string>();
      const folders = new Set<string>();
      for (const obj of objects) {
        if (!obj.startsWith(base)) continue;
        const rest = obj.slice(base.length);
        const slash = rest.indexOf("/");
        if (slash === -1) files.add(rest);
        else folders.add(rest.slice(0, slash));
      }
      const entries: StorageEntry[] = [
        ...[...files].sort().map((name) => ({ name, id: `id-${name}` })),
        ...[...folders].sort().map((name) => ({ name, id: null })),
      ];
      return { data: entries.slice(offset, offset + limit), error: null };
    },
    async remove(paths) {
      for (const p of paths) {
        objects.delete(p);
        removed.push(p);
      }
      return { error: null };
    },
  };

  return { store, objects, removed, listOffsets };
}

test("removes ALL 150 flat objects across >1 page; none skipped", async () => {
  const paths = Array.from({ length: 150 }, (_, i) => `user1/obj-${String(i).padStart(3, "0")}`);
  const { store, objects, removed, listOffsets } = makeStore(paths);

  const { removed: count } = await removeAllUnderPrefix(store, "user1", { pageSize: 100 });

  assert.equal(count, 150); // first 100 + remaining 50
  assert.equal(objects.size, 0); // nothing left in the bucket
  assert.equal(new Set(removed).size, 150); // every distinct object removed once
  assert.deepEqual([...new Set(removed)].sort(), [...paths].sort()); // exactly those, none skipped
  // Safety property: every list used offset 0 (never a shrinking-collection offset).
  assert.ok(listOffsets.every((o) => o === 0));
});

test("removes nested folders (prefix entries) too", async () => {
  const paths = [
    "user2/a",
    "user2/b",
    "user2/sub/c",
    "user2/sub/d",
    "user2/sub/deep/e",
  ];
  const { store, objects, removed } = makeStore(paths);

  const { removed: count } = await removeAllUnderPrefix(store, "user2", { pageSize: 100 });

  assert.equal(count, 5);
  assert.equal(objects.size, 0); // nested user assets actually removed
  assert.deepEqual([...new Set(removed)].sort(), [...paths].sort());
});

test("empty prefix is a no-op", async () => {
  const { store } = makeStore([]);
  const { removed } = await removeAllUnderPrefix(store, "user3");
  assert.equal(removed, 0);
});

test("a list error is surfaced (never silently claims success)", async () => {
  const store: StorageLike = {
    async list() {
      return { data: null, error: { message: "boom" } };
    },
    async remove() {
      return { error: null };
    },
  };
  await assert.rejects(() => removeAllUnderPrefix(store, "user4"), /boom/);
});

test("bounded: a backend that never empties throws instead of looping forever", async () => {
  // Always returns one file and never actually deletes → would loop forever without the cap.
  const store: StorageLike = {
    async list() {
      return { data: [{ name: "stuck", id: "id" }], error: null };
    },
    async remove() {
      return { error: null };
    },
  };
  await assert.rejects(
    () => removeAllUnderPrefix(store, "user5", { maxIterations: 50 }),
    /iteration_cap/,
  );
});
