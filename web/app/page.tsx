"use client";

import { type ReactElement, useEffect } from "react";
import ClearAllDoneBar from "../components/clear-all-done-bar";
import ComposeRow from "../components/compose-row";
import Sidebar from "../components/sidebar";
import TodoList from "../components/todo-list";
import TopBar from "../components/top-bar";
import { isEditableTarget } from "../utils/keyboard";
import { useTodos } from "../utils/store";
import { FILTERS, type Filter } from "../utils/todo";

export default function Page(): ReactElement {
  const { hydrated, filter, search, setFilter, setSearch } = useTodos();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const idx = Number.parseInt(e.key, 10);
      if (idx >= 1 && idx <= FILTERS.length) {
        e.preventDefault();
        setFilter(FILTERS[idx - 1]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFilter]);

  return (
    <div className="flex min-h-dvh">
      <Sidebar filter={filter} onFilter={setFilter} />
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar search={search} onSearch={setSearch} />
        <MobileFilterBar filter={filter} onFilter={setFilter} />
        <div className="flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
          <ComposeRow />
          {hydrated ? (
            <TodoList />
          ) : (
            <div className="text-center text-muted py-20 text-sm">Loading…</div>
          )}
        </div>
        <ClearAllDoneBar />
      </main>
    </div>
  );
}

function MobileFilterBar({
  filter,
  onFilter,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
}): ReactElement {
  return (
    <div className="md:hidden sticky top-14 z-10 bg-bg/90 backdrop-blur border-b border-border/50">
      <div className="flex max-w-2xl mx-auto px-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFilter(f)}
            className={`
              flex-1 py-2.5 text-sm capitalize transition-colors
              ${f === filter ? "text-accent border-b-2 border-accent font-medium" : "text-muted hover:text-text"}
            `}
          >
            {f.toLowerCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
