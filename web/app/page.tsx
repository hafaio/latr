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
  const { hydrated, filter, search, focusId, setFilter, setSearch, setFocus } =
    useTodos();
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

  useEffect(() => {
    // ⌘/Ctrl + key shortcuts on the focused row (fallback: hovered row).
    // Keys match data-action on TodoRow buttons; missing buttons no-op.
    // Dispatch on keydown so the browser default (bookmark / save) is
    // preempted by preventDefault; e.repeat filters OS auto-repeat so
    // holding the key cascades no further, but a re-press without
    // releasing ⌘ still fires a fresh keydown with e.repeat=false.
    // Backspace (not X) is the delete shortcut so ⌘+X stays as cut.
    const SHORTCUTS: Record<string, string> = {
      d: "primary",
      s: "snooze",
      u: "unsnooze",
      backspace: "delete",
    };
    function matchShortcut(e: KeyboardEvent): string | null {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return null;
      return SHORTCUTS[e.key.toLowerCase()] ?? null;
    }
    function onKeyDown(e: KeyboardEvent) {
      const action = matchShortcut(e);
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      const row = focusId
        ? document.querySelector(`[data-todo-id="${focusId}"]`)
        : document.querySelector("[data-todo-id]:hover");
      const btn = row?.querySelector<HTMLButtonElement>(
        `[data-action="${action}"]`,
      );
      btn?.click();
    }
    // Capture phase so we run before descendant listeners and before the
    // browser's default action fires.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [focusId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const row = target?.closest<HTMLElement>("[data-todo-id]");
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>("[data-todo-id]"),
      );
      if (rows.length === 0) return;

      // Not inside a todo row: wake from compose/search into the first/last
      // row if the current target isn't something that owns arrow keys.
      if (!row) {
        if (isEditableTarget(target)) return;
        const pick = e.key === "ArrowDown" ? rows[0] : rows[rows.length - 1];
        const id = pick.getAttribute("data-todo-id");
        if (id) setFocus(id);
        e.preventDefault();
        return;
      }

      // Inside a todo row's textarea: only hand off to row-nav when the
      // caret has no logical newline in the direction of travel; otherwise
      // let the browser move the caret within the multi-line textarea.
      const ta = target as HTMLTextAreaElement;
      if (ta.tagName !== "TEXTAREA") return;
      const value = ta.value;
      if (e.key === "ArrowUp") {
        const before = value.slice(0, ta.selectionStart ?? 0);
        if (before.includes("\n")) return;
      } else {
        const after = value.slice(ta.selectionEnd ?? value.length);
        if (after.includes("\n")) return;
      }
      const idx = rows.indexOf(row);
      const nextIdx = e.key === "ArrowUp" ? idx - 1 : idx + 1;
      if (nextIdx < 0 || nextIdx >= rows.length) return;
      const id = rows[nextIdx].getAttribute("data-todo-id");
      if (id) {
        setFocus(id);
        e.preventDefault();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setFocus]);

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
