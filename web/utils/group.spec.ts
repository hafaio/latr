import { describe, expect, test } from "bun:test";
import { type Bucket, groupForFilter } from "./group";
import { epochToIso, type Todo } from "./todo";

function todo(overrides: Partial<Todo>): Todo {
  const base = 1_700_000_000_000;
  return {
    id: overrides.id ?? "id",
    text: overrides.text ?? "",
    state: overrides.state ?? "ACTIVE",
    createdAt: base,
    modifiedAt: overrides.modifiedAt ?? base,
    serverModifiedAt: null,
    snoozeUntil: overrides.snoozeUntil ?? null,
    pinned: overrides.pinned ?? false,
    deleted: false,
  };
}

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function byLabel(buckets: Bucket[]): Record<string, string[]> {
  return Object.fromEntries(
    buckets.map((b) => [b.label, b.todos.map((t) => t.id)]),
  );
}

describe("groupForFilter — ACTIVE", () => {
  // Fixed local midday so "today" is unambiguous.
  const now = new Date(2026, 3, 15, 12, 0, 0).getTime();

  test("keys date buckets on unsnooze time, not modifiedAt", () => {
    const buckets = groupForFilter(
      [
        todo({
          id: "unsnoozed",
          modifiedAt: now - 30 * DAY,
          snoozeUntil: epochToIso(now - HOUR),
        }),
      ],
      "ACTIVE",
      now,
    );
    expect(byLabel(buckets).Today).toEqual(["unsnoozed"]);
  });

  test("plain rows bucket by modifiedAt", () => {
    const buckets = groupForFilter(
      [
        todo({ id: "today", modifiedAt: now }),
        todo({ id: "ancient", modifiedAt: now - 30 * DAY }),
      ],
      "ACTIVE",
      now,
    );
    const labels = byLabel(buckets);
    expect(labels.Today).toEqual(["today"]);
    expect(labels.Earlier).toEqual(["ancient"]);
  });

  test("pinned rows form a top bucket and are excluded from date buckets", () => {
    const buckets = groupForFilter(
      [
        todo({ id: "pin", pinned: true, modifiedAt: now - 30 * DAY }),
        todo({ id: "plain", modifiedAt: now }),
      ],
      "ACTIVE",
      now,
    );
    expect(buckets[0].label).toBe("Pinned");
    expect(buckets[0].todos.map((t) => t.id)).toEqual(["pin"]);
    const labels = byLabel(buckets);
    expect(labels.Today).toEqual(["plain"]);
    // The pinned row is not duplicated into the date buckets.
    expect(labels.Earlier).toBeUndefined();
  });

  test("no Pinned bucket when nothing is pinned", () => {
    const buckets = groupForFilter(
      [todo({ id: "a", modifiedAt: now })],
      "ACTIVE",
      now,
    );
    expect(buckets.map((b) => b.label)).toEqual(["Today"]);
  });
});

describe("groupForFilter — DONE / ALL", () => {
  const now = new Date(2026, 3, 15, 12, 0, 0).getTime();

  test("buckets by modifiedAt and ignores pinned", () => {
    const buckets = groupForFilter(
      [
        todo({ id: "pin-old", pinned: true, modifiedAt: now - 30 * DAY }),
        todo({ id: "today", modifiedAt: now }),
      ],
      "DONE",
      now,
    );
    const labels = byLabel(buckets);
    expect(labels.Today).toEqual(["today"]);
    expect(labels.Earlier).toEqual(["pin-old"]);
    expect(buckets.some((b) => b.label === "Pinned")).toBe(false);
  });
});

describe("groupForFilter — SNOOZED", () => {
  const now = new Date(2026, 3, 15, 12, 0, 0).getTime();

  test("buckets by local-day threshold of snoozeUntil", () => {
    const buckets = groupForFilter(
      [
        todo({ id: "later-today", snoozeUntil: epochToIso(now + 4 * HOUR) }),
        todo({ id: "tomorrow", snoozeUntil: epochToIso(now + DAY) }),
        todo({ id: "thisweek", snoozeUntil: epochToIso(now + 3 * DAY) }),
        todo({ id: "far", snoozeUntil: epochToIso(now + 30 * DAY) }),
      ],
      "SNOOZED",
      now,
    );
    const labels = byLabel(buckets);
    expect(labels["Later today"]).toEqual(["later-today"]);
    expect(labels.Tomorrow).toEqual(["tomorrow"]);
    expect(labels["This week"]).toEqual(["thisweek"]);
    expect(labels.Later).toEqual(["far"]);
  });
});
