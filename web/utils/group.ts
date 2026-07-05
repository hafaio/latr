import { activeSortKey, type Filter, isoToEpoch, type Todo } from "./todo";

export type Bucket = {
  label: string;
  todos: Todo[];
};

function startOfDay(epoch: number): number {
  const d = new Date(epoch);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const DAY = 24 * 60 * 60 * 1000;

function groupByPastKey(
  todos: readonly Todo[],
  keyFn: (t: Todo) => number,
  now: number,
): Bucket[] {
  const today = startOfDay(now);
  const yesterday = today - DAY;
  const weekAgo = today - 6 * DAY;
  const buckets = makeBuckets(["Today", "Yesterday", "This week", "Earlier"]);
  for (const t of todos) {
    const d = startOfDay(keyFn(t));
    if (d >= today) buckets[0].todos.push(t);
    else if (d >= yesterday) buckets[1].todos.push(t);
    else if (d >= weekAgo) buckets[2].todos.push(t);
    else buckets[3].todos.push(t);
  }
  return buckets.filter((b) => b.todos.length > 0);
}

function groupBySnoozeUntil(todos: readonly Todo[], now: number): Bucket[] {
  const today = startOfDay(now);
  const tomorrow = today + DAY;
  const weekOut = today + 7 * DAY;
  const buckets = makeBuckets([
    "Later today",
    "Tomorrow",
    "This week",
    "Later",
  ]);
  for (const t of todos) {
    if (!t.snoozeUntil) continue;
    const d = startOfDay(isoToEpoch(t.snoozeUntil));
    if (d < tomorrow) buckets[0].todos.push(t);
    else if (d < tomorrow + DAY) buckets[1].todos.push(t);
    else if (d < weekOut) buckets[2].todos.push(t);
    else buckets[3].todos.push(t);
  }
  return buckets.filter((b) => b.todos.length > 0);
}

/** Buckets an already-sorted list, preserving order within each bucket. */
export function groupForFilter(
  sorted: readonly Todo[],
  filter: Filter,
  now: number,
): Bucket[] {
  switch (filter) {
    case "SNOOZED":
      return groupBySnoozeUntil(sorted, now);
    case "ACTIVE": {
      const pinned = sorted.filter((t) => t.pinned);
      const rest = sorted.filter((t) => !t.pinned);
      const buckets: Bucket[] = [];
      if (pinned.length > 0) buckets.push({ label: "Pinned", todos: pinned });
      buckets.push(...groupByPastKey(rest, activeSortKey, now));
      return buckets;
    }
    case "DONE":
    case "ALL":
      return groupByPastKey(sorted, (t) => t.modifiedAt, now);
  }
}

function makeBuckets(labels: string[]): Bucket[] {
  return labels.map((label) => ({ label, todos: [] }));
}
