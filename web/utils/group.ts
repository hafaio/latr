import type { Todo } from "./todo";
import { isoToEpoch } from "./todo";

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

export function groupByModifiedAt(
  todos: readonly Todo[],
  now: number = Date.now(),
): Bucket[] {
  const today = startOfDay(now);
  const yesterday = today - DAY;
  const weekAgo = today - 6 * DAY;
  const buckets = makeBuckets(["Today", "Yesterday", "This week", "Earlier"]);
  for (const t of todos) {
    const d = startOfDay(t.modifiedAt);
    if (d >= today) buckets[0].todos.push(t);
    else if (d >= yesterday) buckets[1].todos.push(t);
    else if (d >= weekAgo) buckets[2].todos.push(t);
    else buckets[3].todos.push(t);
  }
  return buckets.filter((b) => b.todos.length > 0);
}

export function groupBySnoozeUntil(
  todos: readonly Todo[],
  now: number = Date.now(),
): Bucket[] {
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

function makeBuckets(labels: string[]): Bucket[] {
  return labels.map((label) => ({ label, todos: [] }));
}
