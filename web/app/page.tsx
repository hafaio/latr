"use client";

import { type ReactElement, useEffect, useState } from "react";
import ClearAllDoneBar from "../components/clear-all-done-bar";
import ComposeRow from "../components/compose-row";
import Sidebar from "../components/sidebar";
import TodoList from "../components/todo-list";
import TopBar from "../components/top-bar";
import { isEditableTarget } from "../utils/keyboard";
import { useTodos } from "../utils/store";
import { FILTERS, type Filter } from "../utils/todo";

const SIDEBAR_COLLAPSED_KEY = "latr:sidebar:v1";

export default function Page(): ReactElement {
  const { hydrated, filter, search, setFilter, setSearch } = useTodos();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

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
    <div className="min-h-dvh">
      <Sidebar
        filter={filter}
        onFilter={setFilter}
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
      />
      <main
        style={
          {
            "--sidebar-reserved": collapsed ? "3.5rem" : "14rem",
          } as React.CSSProperties
        }
        className="flex flex-col min-h-dvh min-w-0"
      >
        <TopBar search={search} onSearch={setSearch} />
        <MobileFilterBar filter={filter} onFilter={setFilter} />
        <div
          className="
            flex-1 w-full max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-96 space-y-6
            md:ml-[max(var(--sidebar-reserved),calc((100vw-42rem)/2))]
            transition-[margin-left] duration-200 ease-out
          "
        >
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
