"use client";

import type { ReactElement } from "react";
import { useTodos } from "../utils/store";

export default function ClearAllDoneBar(): ReactElement | null {
  const {
    filter,
    todos,
    lastClearedDone,
    undoExpiresAt,
    clearAllDone,
    undoClearAllDone,
  } = useTodos();

  if (filter !== "DONE") return null;

  const hasDone = todos.some((t) => t.state === "DONE");
  const showUndo = lastClearedDone && undoExpiresAt;

  if (!showUndo && !hasDone) return null;

  return (
    <div className="sticky bottom-0 bg-bg/90 backdrop-blur">
      <div
        className="
          max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between text-sm
          md:ml-[max(var(--sidebar-reserved),calc((100vw-42rem)/2))]
          transition-[margin-left] duration-200 ease-out
        "
      >
        {showUndo ? (
          <>
            <span className="text-muted">
              Cleared {lastClearedDone?.length} todo
              {lastClearedDone && lastClearedDone.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={undoClearAllDone}
              className="px-3 py-1.5 rounded-lg text-accent hover:bg-surface-hover transition-colors font-medium"
            >
              Undo
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={clearAllDone}
            className="ml-auto px-3 py-1.5 rounded-lg text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            Clear all done
          </button>
        )}
      </div>
    </div>
  );
}
