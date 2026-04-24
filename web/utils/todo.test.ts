import { describe, expect, test } from "bun:test";
import {
  epochToIso,
  fromFirestore,
  isoToEpoch,
  matchesFilter,
  rankBySearch,
  sortForFilter,
  type Todo,
  toFirestoreFields,
} from "./todo";

function todo(overrides: Partial<Todo> = {}): Todo {
  const now = 1_700_000_000_000;
  return {
    id: overrides.id ?? "id",
    text: overrides.text ?? "",
    state: overrides.state ?? "ACTIVE",
    createdAt: overrides.createdAt ?? now,
    modifiedAt: overrides.modifiedAt ?? now,
    serverModifiedAt: overrides.serverModifiedAt ?? 0,
    snoozeUntil: overrides.snoozeUntil ?? null,
    pinned: overrides.pinned ?? false,
    deleted: overrides.deleted ?? false,
  };
}

describe("epochToIso / isoToEpoch", () => {
  test("roundtrips a specific local time", () => {
    // epochToIso formats in the machine's local tz; round-tripping back
    // through isoToEpoch (which uses `new Date(iso)`) should return the
    // same millis as long as we start from a whole second.
    const epoch = new Date(2026, 2, 15, 9, 30, 0).getTime();
    expect(isoToEpoch(epochToIso(epoch))).toBe(epoch);
  });

  test("drops sub-second precision", () => {
    const epoch = new Date(2026, 2, 15, 9, 30, 7, 823).getTime();
    const rounded = new Date(2026, 2, 15, 9, 30, 7).getTime();
    expect(isoToEpoch(epochToIso(epoch))).toBe(rounded);
  });
});

describe("toFirestoreFields", () => {
  test("strips id and serverModifiedAt", () => {
    const t = todo({ id: "abc", serverModifiedAt: 999 });
    const fields = toFirestoreFields(t);
    expect(fields).not.toHaveProperty("id");
    expect(fields).not.toHaveProperty("serverModifiedAt");
    expect(fields).toHaveProperty("text");
    expect(fields).toHaveProperty("state");
    expect(fields).toHaveProperty("modifiedAt");
    expect(fields).toHaveProperty("deleted");
  });
});

describe("fromFirestore", () => {
  test("fills defaults for missing fields", () => {
    const t = fromFirestore("id", {});
    expect(t.id).toBe("id");
    expect(t.text).toBe("");
    expect(t.state).toBe("ACTIVE");
    expect(t.snoozeUntil).toBeNull();
    expect(t.pinned).toBe(false);
    expect(t.deleted).toBe(false);
  });

  test("coerces unknown state to ACTIVE", () => {
    expect(fromFirestore("id", { state: "BOGUS" }).state).toBe("ACTIVE");
  });

  test("falls back to modifiedAt when serverModifiedAt is missing", () => {
    const t = fromFirestore("id", { modifiedAt: 42 });
    expect(t.serverModifiedAt).toBe(42);
  });

  test("reads server timestamp via toMillis", () => {
    const ts = { toMillis: () => 12345 };
    const t = fromFirestore("id", { serverModifiedAt: ts, modifiedAt: 1 });
    expect(t.serverModifiedAt).toBe(12345);
  });

  test("accepts a raw number for serverModifiedAt", () => {
    const t = fromFirestore("id", { serverModifiedAt: 99, modifiedAt: 1 });
    expect(t.serverModifiedAt).toBe(99);
  });

  test("deleted flag reads strictly true", () => {
    expect(fromFirestore("id", { deleted: true }).deleted).toBe(true);
    expect(fromFirestore("id", { deleted: 1 }).deleted).toBe(false);
    expect(fromFirestore("id", { deleted: "true" }).deleted).toBe(false);
  });
});

describe("matchesFilter", () => {
  const NOW = 1_700_000_000_000;
  const FUTURE = epochToIso(NOW + 60_000);
  const PAST = epochToIso(NOW - 60_000);

  test("ALL matches everything", () => {
    expect(matchesFilter(todo({ state: "DONE" }), "ALL", NOW)).toBe(true);
    expect(matchesFilter(todo({ state: "SNOOZED" }), "ALL", NOW)).toBe(true);
    expect(matchesFilter(todo({ state: "ACTIVE" }), "ALL", NOW)).toBe(true);
  });

  test("DONE only matches DONE todos", () => {
    expect(matchesFilter(todo({ state: "DONE" }), "DONE", NOW)).toBe(true);
    expect(matchesFilter(todo({ state: "ACTIVE" }), "DONE", NOW)).toBe(false);
    expect(matchesFilter(todo({ state: "SNOOZED" }), "DONE", NOW)).toBe(false);
  });

  test("SNOOZED requires actively-snoozed (future snoozeUntil)", () => {
    expect(
      matchesFilter(
        todo({ state: "SNOOZED", snoozeUntil: FUTURE }),
        "SNOOZED",
        NOW,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        todo({ state: "SNOOZED", snoozeUntil: PAST }),
        "SNOOZED",
        NOW,
      ),
    ).toBe(false);
  });

  test("ACTIVE includes expired-snoozed but not active-snoozed", () => {
    expect(
      matchesFilter(
        todo({ state: "SNOOZED", snoozeUntil: PAST }),
        "ACTIVE",
        NOW,
      ),
    ).toBe(true);
    expect(
      matchesFilter(
        todo({ state: "SNOOZED", snoozeUntil: FUTURE }),
        "ACTIVE",
        NOW,
      ),
    ).toBe(false);
    expect(matchesFilter(todo({ state: "DONE" }), "ACTIVE", NOW)).toBe(false);
  });
});

describe("sortForFilter", () => {
  test("ACTIVE: pinned first, then most-recent modifiedAt", () => {
    const a = todo({ id: "a", modifiedAt: 100 });
    const b = todo({ id: "b", modifiedAt: 300, pinned: true });
    const c = todo({ id: "c", modifiedAt: 200 });
    const sorted = sortForFilter([a, b, c], "ACTIVE").map((t) => t.id);
    expect(sorted).toEqual(["b", "c", "a"]);
  });

  test("ACTIVE: snoozeUntil (when present) overrides modifiedAt as the sort key", () => {
    const a = todo({ id: "a", modifiedAt: 1000 });
    const b = todo({
      id: "b",
      modifiedAt: 500,
      snoozeUntil: epochToIso(2000),
    });
    const sorted = sortForFilter([a, b], "ACTIVE").map((t) => t.id);
    expect(sorted).toEqual(["b", "a"]);
  });

  test("SNOOZED: earliest snoozeUntil first", () => {
    const later = todo({ id: "later", snoozeUntil: epochToIso(3000) });
    const sooner = todo({ id: "sooner", snoozeUntil: epochToIso(1000) });
    const sorted = sortForFilter([later, sooner], "SNOOZED").map((t) => t.id);
    expect(sorted).toEqual(["sooner", "later"]);
  });

  test("DONE/ALL: most-recent modifiedAt first", () => {
    const old = todo({ id: "old", modifiedAt: 100 });
    const fresh = todo({ id: "fresh", modifiedAt: 900 });
    expect(sortForFilter([old, fresh], "DONE").map((t) => t.id)).toEqual([
      "fresh",
      "old",
    ]);
    expect(sortForFilter([old, fresh], "ALL").map((t) => t.id)).toEqual([
      "fresh",
      "old",
    ]);
  });

  test("does not mutate input", () => {
    const input = [
      todo({ id: "a", modifiedAt: 100 }),
      todo({ id: "b", modifiedAt: 200 }),
    ];
    const snapshot = input.slice();
    sortForFilter(input, "ACTIVE");
    expect(input).toEqual(snapshot);
  });
});

describe("rankBySearch", () => {
  test("empty query returns all items unchanged", () => {
    const items = [todo({ id: "a" }), todo({ id: "b" })];
    expect(rankBySearch(items, "").map((t) => t.id)).toEqual(["a", "b"]);
    expect(rankBySearch(items, "   ").map((t) => t.id)).toEqual(["a", "b"]);
  });

  test("matches prefix on word boundary, ignores mid-word", () => {
    const hit = todo({ id: "hit", text: "email reply" });
    const miss = todo({ id: "miss", text: "female review" });
    expect(rankBySearch([hit, miss], "mail").map((t) => t.id)).toEqual([]);
    expect(rankBySearch([hit, miss], "em").map((t) => t.id)).toEqual(["hit"]);
  });

  test("higher word-match count ranks higher", () => {
    const two = todo({ id: "two", text: "buy milk and bread" });
    const one = todo({ id: "one", text: "buy coffee" });
    expect(rankBySearch([one, two], "buy milk").map((t) => t.id)).toEqual([
      "two",
      "one",
    ]);
  });

  test("escapes regex metacharacters in the query", () => {
    // The word-boundary anchor only starts at a word char, so we test the
    // escape with a digit-leading query; an unescaped `.` would otherwise
    // match any char and pull in unrelated rows.
    const hit = todo({ id: "hit", text: "price is $5.99 today" });
    const miss = todo({ id: "miss", text: "code 5x99" });
    expect(rankBySearch([hit, miss], "5.99").map((x) => x.id)).toEqual(["hit"]);
  });
});
