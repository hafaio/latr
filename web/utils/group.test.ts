import { describe, expect, test } from "bun:test";
import { groupByModifiedAt, groupBySnoozeUntil } from "./group";
import { epochToIso, type Todo } from "./todo";

function todo(overrides: Partial<Todo>): Todo {
  const base = 1_700_000_000_000;
  return {
    id: overrides.id ?? "id",
    text: "",
    state: overrides.state ?? "ACTIVE",
    createdAt: base,
    modifiedAt: overrides.modifiedAt ?? base,
    serverModifiedAt: 0,
    snoozeUntil: overrides.snoozeUntil ?? null,
    pinned: false,
    deleted: false,
  };
}

const DAY = 24 * 60 * 60 * 1000;

describe("groupByModifiedAt", () => {
  // Pin `now` at a fixed local midday so "today" is unambiguous.
  const now = new Date(2026, 3, 15, 12, 0, 0).getTime();

  test("buckets items by local-day threshold", () => {
    const buckets = groupByModifiedAt(
      [
        todo({ id: "today", modifiedAt: now }),
        todo({ id: "yest", modifiedAt: now - DAY }),
        todo({ id: "threedays", modifiedAt: now - 3 * DAY }),
        todo({ id: "ancient", modifiedAt: now - 30 * DAY }),
      ],
      now,
    );
    const byLabel = Object.fromEntries(
      buckets.map((b) => [b.label, b.todos.map((t) => t.id)]),
    );
    expect(byLabel.Today).toEqual(["today"]);
    expect(byLabel.Yesterday).toEqual(["yest"]);
    expect(byLabel["This week"]).toEqual(["threedays"]);
    expect(byLabel.Earlier).toEqual(["ancient"]);
  });

  test("hides empty buckets", () => {
    const buckets = groupByModifiedAt(
      [todo({ id: "a", modifiedAt: now })],
      now,
    );
    expect(buckets.map((b) => b.label)).toEqual(["Today"]);
  });
});

describe("groupBySnoozeUntil", () => {
  const now = new Date(2026, 3, 15, 12, 0, 0).getTime();

  test("buckets by local-day threshold of snoozeUntil", () => {
    const buckets = groupBySnoozeUntil(
      [
        todo({
          id: "later-today",
          snoozeUntil: epochToIso(now + 4 * 60 * 60 * 1000),
        }),
        todo({ id: "tomorrow", snoozeUntil: epochToIso(now + DAY) }),
        todo({ id: "thisweek", snoozeUntil: epochToIso(now + 3 * DAY) }),
        todo({ id: "far", snoozeUntil: epochToIso(now + 30 * DAY) }),
      ],
      now,
    );
    const byLabel = Object.fromEntries(
      buckets.map((b) => [b.label, b.todos.map((t) => t.id)]),
    );
    expect(byLabel["Later today"]).toEqual(["later-today"]);
    expect(byLabel.Tomorrow).toEqual(["tomorrow"]);
    expect(byLabel["This week"]).toEqual(["thisweek"]);
    expect(byLabel.Later).toEqual(["far"]);
  });

  test("skips todos without a snoozeUntil", () => {
    const buckets = groupBySnoozeUntil(
      [todo({ id: "no-snooze", snoozeUntil: null })],
      now,
    );
    expect(buckets).toEqual([]);
  });
});
