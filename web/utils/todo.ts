export type TodoState = "ACTIVE" | "DONE" | "SNOOZED";

export type Todo = {
  id: string;
  text: string;
  state: TodoState;
  createdAt: number;
  modifiedAt: number;
  serverModifiedAt: number;
  snoozeUntil: string | null;
  pinned: boolean;
  deleted: boolean;
};

export const FILTERS = ["ACTIVE", "SNOOZED", "DONE", "ALL"] as const;
export type Filter = (typeof FILTERS)[number];

export function newTodo(text = ""): Todo {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    text,
    state: "ACTIVE",
    createdAt: now,
    modifiedAt: now,
    serverModifiedAt: 0,
    snoozeUntil: null,
    pinned: false,
    deleted: false,
  };
}

export function toFirestoreFields(t: Todo): Record<string, unknown> {
  return {
    text: t.text,
    createdAt: t.createdAt,
    modifiedAt: t.modifiedAt,
    state: t.state,
    snoozeUntil: t.snoozeUntil,
    pinned: t.pinned,
    deleted: t.deleted,
  };
}

function readServerTimestamp(val: unknown, fallback: number): number {
  if (val && typeof val === "object" && "toMillis" in val) {
    return (val as { toMillis: () => number }).toMillis();
  }
  if (typeof val === "number") return val;
  return fallback;
}

export function fromFirestore(id: string, data: Record<string, unknown>): Todo {
  const modifiedAt =
    typeof data.modifiedAt === "number" ? data.modifiedAt : Date.now();
  return {
    id,
    text: typeof data.text === "string" ? data.text : "",
    state: isTodoState(data.state) ? data.state : "ACTIVE",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Date.now(),
    modifiedAt,
    serverModifiedAt: readServerTimestamp(data.serverModifiedAt, modifiedAt),
    snoozeUntil: typeof data.snoozeUntil === "string" ? data.snoozeUntil : null,
    pinned: data.pinned === true,
    deleted: data.deleted === true,
  };
}

function isTodoState(v: unknown): v is TodoState {
  return v === "ACTIVE" || v === "DONE" || v === "SNOOZED";
}

export function isoToEpoch(iso: string): number {
  return new Date(iso).getTime();
}

export function epochToIso(epoch: number): string {
  const d = new Date(epoch);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function matchesFilter(t: Todo, filter: Filter, now: number): boolean {
  switch (filter) {
    case "ALL":
      return true;
    case "DONE":
      return t.state === "DONE";
    case "SNOOZED":
      return (
        t.state === "SNOOZED" &&
        t.snoozeUntil !== null &&
        isoToEpoch(t.snoozeUntil) > now
      );
    case "ACTIVE":
      if (t.state === "ACTIVE") return true;
      if (t.state === "DONE") return false;
      return t.snoozeUntil !== null && isoToEpoch(t.snoozeUntil) <= now;
  }
}

export function sortForFilter(todos: readonly Todo[], filter: Filter): Todo[] {
  const copy = todos.slice();
  switch (filter) {
    case "SNOOZED":
      copy.sort((a, b) => {
        const ax = a.snoozeUntil ? isoToEpoch(a.snoozeUntil) : 0;
        const bx = b.snoozeUntil ? isoToEpoch(b.snoozeUntil) : 0;
        return ax - bx;
      });
      return copy;
    case "ACTIVE":
      copy.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        const ax = a.snoozeUntil ? isoToEpoch(a.snoozeUntil) : a.modifiedAt;
        const bx = b.snoozeUntil ? isoToEpoch(b.snoozeUntil) : b.modifiedAt;
        return bx - ax;
      });
      return copy;
    case "DONE":
    case "ALL":
      copy.sort((a, b) => b.modifiedAt - a.modifiedAt);
      return copy;
  }
}

export function rankBySearch(todos: readonly Todo[], query: string): Todo[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return todos.slice();
  const patterns = words.map((w) => new RegExp(`\\b${escapeRegex(w)}`));
  const scored: { t: Todo; score: number }[] = [];
  for (const t of todos) {
    const hay = t.text.toLowerCase();
    let score = 0;
    for (const p of patterns) {
      if (p.test(hay)) score++;
    }
    if (score > 0) scored.push({ t, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.t);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
