import { describe, expect, test } from "bun:test";
import { initialUi, uiReducer } from "./store";
import type { Todo } from "./todo";

function todo(id: string): Todo {
  return {
    id,
    text: "",
    state: "DONE",
    createdAt: 0,
    modifiedAt: 0,
    serverModifiedAt: 0,
    snoozeUntil: null,
    pinned: false,
    deleted: false,
  };
}

describe("uiReducer", () => {
  test("setFilter clears transient state (focus, undo buffer)", () => {
    const primed = {
      ...initialUi,
      focusId: "x",
      lastClearedDone: [todo("a")],
      undoExpiresAt: 1,
    };
    const next = uiReducer(primed, { type: "setFilter", filter: "DONE" });
    expect(next.filter).toBe("DONE");
    expect(next.focusId).toBeNull();
    expect(next.lastClearedDone).toBeNull();
    expect(next.undoExpiresAt).toBeNull();
  });

  test("setFilter to the current filter returns the same state reference", () => {
    const next = uiReducer(initialUi, {
      type: "setFilter",
      filter: initialUi.filter,
    });
    expect(next).toBe(initialUi);
  });

  test("setSearch/setFocus are no-op when unchanged (same reference)", () => {
    expect(
      uiReducer(initialUi, { type: "setSearch", search: initialUi.search }),
    ).toBe(initialUi);
    expect(
      uiReducer(initialUi, { type: "setFocus", id: initialUi.focusId }),
    ).toBe(initialUi);
  });

  test("setLastClearedDone sets a future undoExpiresAt", () => {
    const before = Date.now();
    const next = uiReducer(initialUi, {
      type: "setLastClearedDone",
      todos: [todo("a")],
    });
    expect(next.lastClearedDone).toHaveLength(1);
    expect(next.undoExpiresAt ?? 0).toBeGreaterThanOrEqual(before);
  });

  test("clearLastClearedDone is no-op when already cleared", () => {
    expect(uiReducer(initialUi, { type: "clearLastClearedDone" })).toBe(
      initialUi,
    );
  });

  test("clearLastClearedDone wipes the undo buffer", () => {
    const primed = {
      ...initialUi,
      lastClearedDone: [todo("a")],
      undoExpiresAt: 1,
    };
    const next = uiReducer(primed, { type: "clearLastClearedDone" });
    expect(next.lastClearedDone).toBeNull();
    expect(next.undoExpiresAt).toBeNull();
  });
});
