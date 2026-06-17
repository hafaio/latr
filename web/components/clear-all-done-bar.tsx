"use client";

import type { ReactElement } from "react";
import { useTodos } from "../utils/store";

export default function ClearAllDoneBar(): ReactElement | null {
  const { filter, todos, lastUndo, undoExpiresAt, clearAllDone, undo } =
    useTodos();

  const showUndo = lastUndo && undoExpiresAt;
  const hasDone = todos.some((t) => t.state === "DONE");
  const showClearAllDone = filter === "DONE" && hasDone;

  if (!showUndo && !showClearAllDone) return null;

  const undoLabel =
    lastUndo?.kind === "snooze"
      ? "Snoozed"
      : `Deleted ${lastUndo?.todos.length} todo${
          lastUndo && lastUndo.todos.length === 1 ? "" : "s"
        }`;

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
            <span className="text-muted">{undoLabel}</span>
            <button
              type="button"
              onClick={undo}
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
