import { describe, expect, test } from "bun:test";
import { planMerge } from "./merge";
import type { Todo } from "./todo";

function todo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: overrides.id ?? "id",
    text: overrides.text ?? "",
    state: overrides.state ?? "ACTIVE",
    createdAt: overrides.createdAt ?? 0,
    modifiedAt: overrides.modifiedAt ?? 0,
    serverModifiedAt: overrides.serverModifiedAt ?? null,
    snoozeUntil: overrides.snoozeUntil ?? null,
    pinned: overrides.pinned ?? false,
    deleted: overrides.deleted ?? false,
  };
}

function remote(...todos: Todo[]): Map<string, Todo> {
  return new Map(todos.map((t) => [t.id, t]));
}

describe("planMerge", () => {
  test("a local row with no remote twin is an offline create — push it", () => {
    const plan = planMerge([todo({ id: "new" })], remote());
    expect(plan.toPush.map((t) => t.id)).toEqual(["new"]);
    expect(plan.toDropLocalIds).toEqual([]);
  });

  test("a newer local row wins over its remote twin", () => {
    const plan = planMerge(
      [todo({ id: "a", modifiedAt: 200 })],
      remote(todo({ id: "a", modifiedAt: 100 })),
    );
    expect(plan.toPush.map((t) => t.id)).toEqual(["a"]);
  });

  test("an older local row is left alone", () => {
    const plan = planMerge(
      [todo({ id: "a", modifiedAt: 100 })],
      remote(todo({ id: "a", modifiedAt: 200 })),
    );
    expect(plan.toPush).toEqual([]);
    expect(plan.toDropLocalIds).toEqual([]);
  });

  test("a remote tombstone kills the local row — no resurrection (bug A)", () => {
    const plan = planMerge(
      [todo({ id: "gone", modifiedAt: 999 })],
      remote(todo({ id: "gone", modifiedAt: 1, deleted: true })),
    );
    expect(plan.toPush).toEqual([]);
    expect(plan.toDropLocalIds).toEqual(["gone"]);
  });

  test("a local tombstone newer than the remote row is pushed — the signed-out delete lands (bug B)", () => {
    const plan = planMerge(
      [todo({ id: "x", modifiedAt: 200, deleted: true })],
      remote(todo({ id: "x", modifiedAt: 100 })),
    );
    expect(plan.toPush.map((t) => [t.id, t.deleted])).toEqual([["x", true]]);
    expect(plan.toDropLocalIds).toEqual([]);
  });

  test("a local tombstone older than a remote edit loses — the edit survives", () => {
    const plan = planMerge(
      [todo({ id: "x", modifiedAt: 100, deleted: true })],
      remote(todo({ id: "x", modifiedAt: 200 })),
    );
    expect(plan.toPush).toEqual([]);
    expect(plan.toDropLocalIds).toEqual([]);
  });

  test("a local tombstone with no remote twin says nothing — never pushed", () => {
    const plan = planMerge([todo({ id: "x", deleted: true })], remote());
    expect(plan.toPush).toEqual([]);
    expect(plan.toDropLocalIds).toEqual([]);
  });

  test("remote tombstone beats local tombstone — already dead, just drop it", () => {
    const plan = planMerge(
      [todo({ id: "x", modifiedAt: 999, deleted: true })],
      remote(todo({ id: "x", modifiedAt: 1, deleted: true })),
    );
    expect(plan.toPush).toEqual([]);
    expect(plan.toDropLocalIds).toEqual(["x"]);
  });

  test("a remote row absent locally is untouched (a fresh device must not wipe the account)", () => {
    const plan = planMerge([], remote(todo({ id: "onlyRemote" })));
    expect(plan.toPush).toEqual([]);
    expect(plan.toDropLocalIds).toEqual([]);
  });
});
