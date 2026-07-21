import type { Todo } from "./todo";

export type MergePlan = {
  /** Local rows (and local tombstones) to write up to Firestore. */
  toPush: Todo[];
  /** Local rows a remote tombstone says are dead. */
  toDropLocalIds: string[];
};

/** Plan the sign-in merge: push local rows newer than remote; remote tombstones kill local. `remote` must be unfiltered. */
export function planMerge(
  local: readonly Todo[],
  remote: ReadonlyMap<string, Todo>,
): MergePlan {
  const toPush: Todo[] = [];
  const toDropLocalIds: string[] = [];
  for (const l of local) {
    const r = remote.get(l.id);
    if (r === undefined) {
      // Never synced, so a tombstone has nothing to delete.
      if (!l.deleted) toPush.push(l);
    } else if (r.deleted) {
      toDropLocalIds.push(l.id);
    } else if (l.modifiedAt > r.modifiedAt) {
      toPush.push(l);
    }
  }
  return { toPush, toDropLocalIds };
}
