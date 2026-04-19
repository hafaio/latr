"use client";

import { type ReactElement, useMemo } from "react";
import { groupByModifiedAt, groupBySnoozeUntil } from "../utils/group";
import { useTodos } from "../utils/store";
import {
  type Filter,
  matchesFilter,
  rankBySearch,
  sortForFilter,
} from "../utils/todo";
import TodoRow from "./todo-row";

export default function TodoList(): ReactElement {
  const { todos, filter, search } = useTodos();

  const { groups, total } = useMemo(() => {
    const now = Date.now();
    const filtered = todos.filter((t) => matchesFilter(t, filter, now));
    if (search.trim().length > 0) {
      const ranked = rankBySearch(filtered, search);
      return {
        groups: ranked.length > 0 ? [{ label: "", todos: ranked }] : [],
        total: ranked.length,
      };
    }
    const sorted = sortForFilter(filtered, filter);
    const buckets =
      filter === "SNOOZED"
        ? groupBySnoozeUntil(sorted, now)
        : groupByModifiedAt(sorted, now);
    return {
      groups: buckets,
      total: sorted.length,
    };
  }, [todos, filter, search]);

  if (total === 0) {
    return (
      <div className="text-center text-muted py-20 text-sm">
        {search.trim().length > 0
          ? `No todos match “${search}”`
          : emptyLabel(filter)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.label || "search"}>
          {group.label && (
            <div className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted">
              {group.label}
            </div>
          )}
          <div className="space-y-0.5">
            {group.todos.map((t) => (
              <TodoRow key={t.id} todo={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function emptyLabel(filter: Filter): string {
  switch (filter) {
    case "ACTIVE":
      return "Nothing to do.";
    case "SNOOZED":
      return "Nothing snoozed.";
    case "DONE":
      return "Nothing done yet.";
    case "ALL":
      return "No todos.";
  }
}
