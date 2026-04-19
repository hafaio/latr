"use client";

import {
  type ReactElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  FaCheckCircle,
  FaClock,
  FaRegCircle,
  FaRegClock,
  FaRegTrashAlt,
  FaUndo,
} from "react-icons/fa";
import { formatSnoozeTime } from "../utils/format";
import { useTodos } from "../utils/store";
import type { Todo } from "../utils/todo";
import { isoToEpoch } from "../utils/todo";
import SnoozeMenu from "./snooze-menu";

export default function TodoRow({ todo }: { todo: Todo }): ReactElement {
  const {
    focusId,
    edit,
    markDone,
    reactivate,
    snooze,
    remove,
    setFocus,
    dropEmpty,
  } = useTodos();
  const focused = focusId === todo.id;
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    if (focused) {
      rowRef.current?.scrollIntoView({ block: "nearest" });
      inputRef.current?.focus();
      const len = inputRef.current?.value.length ?? 0;
      inputRef.current?.setSelectionRange(len, len);
    }
  }, [focused]);

  useEffect(() => {
    if (!focused) return;
    function onBlurKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        (document.activeElement as HTMLElement | null)?.blur();
      }
    }
    window.addEventListener("keydown", onBlurKey);
    return () => window.removeEventListener("keydown", onBlurKey);
  }, [focused]);

  const isDone = todo.state === "DONE";
  const isActivelySnoozed =
    todo.state === "SNOOZED" &&
    todo.snoozeUntil !== null &&
    isoToEpoch(todo.snoozeUntil) > Date.now();
  const wasUnsnoozed =
    !isDone && !isActivelySnoozed && todo.snoozeUntil !== null;

  function primaryToggle() {
    if (isDone) reactivate(todo.id);
    else markDone(todo.id);
  }

  const primaryIcon = isDone ? (
    <FaCheckCircle className="text-done text-base" />
  ) : isActivelySnoozed ? (
    <FaClock className="text-snooze text-base" />
  ) : wasUnsnoozed ? (
    <FaRegClock className="text-snooze text-base" />
  ) : (
    <FaRegCircle className="text-muted text-base" />
  );

  const primaryLabel = isDone ? "Reactivate" : "Mark done";

  return (
    <div
      ref={rowRef}
      data-keep-actions={snoozeOpen}
      className={`
        group/row
        relative
        flex items-center gap-1
        px-2 py-1
        rounded-xl
        hover:bg-surface-hover
        transition-colors
        ${snoozeOpen ? "z-20" : ""}
      `}
    >
      <button
        type="button"
        onClick={primaryToggle}
        aria-label={primaryLabel}
        title={primaryLabel}
        className="p-2 rounded-lg hover:bg-surface-muted transition-colors"
      >
        {primaryIcon}
      </button>

      <label className="flex-1 flex items-center min-w-0 cursor-text py-1.5">
        <input
          ref={inputRef}
          type="text"
          value={todo.text}
          onChange={(e) => edit(todo.id, e.target.value)}
          onFocus={() => setFocus(todo.id)}
          onBlur={() => {
            setFocus(null);
            if (todo.text.trim().length === 0) remove(todo.id);
            else dropEmpty();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className={`
            flex-1 min-w-0 bg-transparent outline-none text-text
            placeholder:text-muted
            ${isDone ? "line-through text-muted" : ""}
          `}
        />
      </label>

      {isActivelySnoozed && todo.snoozeUntil && (
        <span
          className="
            pr-2 text-xs text-snooze shrink-0 whitespace-nowrap
            opacity-100 group-hover/row:opacity-0 focus-within:opacity-0
            group-data-[keep-actions=true]/row:opacity-0
            transition-opacity
          "
        >
          {formatSnoozeTime(isoToEpoch(todo.snoozeUntil))}
        </span>
      )}

      <div
        className="
          absolute right-2 top-1/2 -translate-y-1/2
          flex items-center gap-0.5
          opacity-0 group-hover/row:opacity-100 focus-within:opacity-100
          group-data-[keep-actions=true]/row:opacity-100
          transition-opacity
        "
      >
        {isActivelySnoozed && (
          <button
            type="button"
            onClick={() => reactivate(todo.id)}
            aria-label="Unsnooze"
            title="Unsnooze"
            className="p-2 rounded-lg text-accent hover:bg-surface-muted transition-colors"
          >
            <FaUndo className="text-sm" />
          </button>
        )}

        {!isDone && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setSnoozeOpen((v) => !v)}
              aria-label={isActivelySnoozed ? "Reschedule snooze" : "Snooze"}
              title={isActivelySnoozed ? "Reschedule" : "Snooze"}
              className="p-2 rounded-lg text-snooze hover:bg-surface-muted transition-colors"
            >
              <FaRegClock className="text-sm" />
            </button>
            {snoozeOpen && (
              <SnoozeMenu
                onPick={(epoch) => {
                  snooze(todo.id, epoch);
                  setSnoozeOpen(false);
                }}
                onClose={() => setSnoozeOpen(false)}
              />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => remove(todo.id)}
          aria-label="Delete"
          title="Delete"
          className="p-2 rounded-lg text-muted hover:text-danger hover:bg-surface-muted transition-colors"
        >
          <FaRegTrashAlt className="text-sm" />
        </button>
      </div>
    </div>
  );
}
