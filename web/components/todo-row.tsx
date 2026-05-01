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
import { useModifierHeld } from "../utils/kbd-modifier";
import { useTodos } from "../utils/store";
import type { Todo } from "../utils/todo";
import { isoToEpoch } from "../utils/todo";
import SnoozeMenu from "./snooze-menu";

function Hint({
  children,
  tint,
}: {
  children: string;
  tint?: string;
}): ReactElement {
  return (
    <kbd
      className={`
        absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
        px-1 py-0.5
        text-[10px] font-sans font-semibold leading-none
        rounded bg-surface-muted
        pointer-events-none
        ${tint ?? ""}
      `}
    >
      {children}
    </kbd>
  );
}

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
  const modifierHeld = useModifierHeld();
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [text, setText] = useState(todo.text);
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  // Hints follow focus, and fall back to hover when nothing is focused so
  // you can ⌘-act on whichever row the mouse is over without clicking in.
  const showHints =
    modifierHeld && (focused || (focusId === null && isHovered));
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // While the input is focused, its value is owned by `text` and never
  // overwritten by re-renders from the store. Without this, every snapshot
  // listener tick would re-render the input with a fresh (equal-content)
  // todo reference and occasionally jump the cursor to the end mid-edit.
  useEffect(() => {
    if (!isFocused) setText(todo.text);
  }, [todo.text, isFocused]);

  // Imperatively attach hover listeners so biome's a11y rule doesn't flag
  // onMouseEnter/Leave props on a non-interactive <div>. Hover state only
  // drives visual ⌘-hint positioning; no keyboard path depends on it.
  useEffect(() => {
    const node = rowRef.current;
    if (!node) return;
    const onEnter = () => setIsHovered(true);
    const onLeave = () => setIsHovered(false);
    node.addEventListener("mouseenter", onEnter);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mouseenter", onEnter);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, []);

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
      data-todo-id={todo.id}
      data-keep-actions={snoozeOpen}
      className={`
        group/row
        relative
        flex items-center gap-1
        px-2 py-1
        rounded-xl
        hover:bg-surface-hover focus-within:bg-surface-hover
        transition-colors
        ${snoozeOpen ? "z-20" : ""}
      `}
    >
      <button
        type="button"
        data-action="primary"
        onClick={primaryToggle}
        aria-label={primaryLabel}
        title={primaryLabel}
        className="relative p-2 rounded-lg hover:bg-surface-muted transition-colors shrink-0"
      >
        <span className={showHints ? "invisible" : undefined}>
          {primaryIcon}
        </span>
        {showHints && <Hint tint="text-done">D</Hint>}
      </button>

      <label className="flex-1 flex min-w-0 cursor-text py-1.5">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            edit(todo.id, e.target.value);
          }}
          onFocus={() => {
            setIsFocused(true);
            setFocus(todo.id);
          }}
          onBlur={() => {
            setIsFocused(false);
            setFocus(null);
            if (text.trim().length === 0) remove(todo.id);
            else dropEmpty();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              (e.currentTarget as HTMLTextAreaElement).blur();
            }
          }}
          className={`
            flex-1 min-w-0 bg-transparent outline-none text-text resize-none
            field-sizing-content overflow-hidden leading-snug
            placeholder:text-muted
            ${isDone ? "line-through text-muted" : ""}
          `}
        />
      </label>

      {isActivelySnoozed && todo.snoozeUntil && (
        <span
          className="
            pr-2 text-xs text-snooze shrink-0 whitespace-nowrap
            opacity-100 group-hover/row:opacity-0 group-focus-within/row:opacity-0
            group-data-[keep-actions=true]/row:opacity-0
            transition-opacity
          "
        >
          {formatSnoozeTime(isoToEpoch(todo.snoozeUntil))}
        </span>
      )}

      <div
        className="
          absolute right-2 top-1
          flex items-center gap-0.5
          bg-surface-hover rounded-lg
          opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100
          group-data-[keep-actions=true]/row:opacity-100
          transition-opacity
        "
      >
        {isActivelySnoozed && (
          <button
            type="button"
            data-action="unsnooze"
            onClick={() => reactivate(todo.id)}
            aria-label="Unsnooze"
            title="Unsnooze"
            className="relative p-2 rounded-lg text-accent hover:bg-surface-muted transition-colors"
          >
            <FaUndo className={`text-sm ${showHints ? "invisible" : ""}`} />
            {showHints && <Hint>U</Hint>}
          </button>
        )}

        {!isDone && (
          <div className="relative">
            <button
              type="button"
              data-action="snooze"
              onClick={() => setSnoozeOpen((v) => !v)}
              aria-label={isActivelySnoozed ? "Reschedule snooze" : "Snooze"}
              title={isActivelySnoozed ? "Reschedule" : "Snooze"}
              className="relative p-2 rounded-lg text-snooze hover:bg-surface-muted transition-colors"
            >
              <FaRegClock
                className={`text-sm ${showHints ? "invisible" : ""}`}
              />
              {showHints && <Hint>S</Hint>}
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
          data-action="delete"
          onClick={() => remove(todo.id)}
          aria-label="Delete"
          title="Delete"
          className="relative p-2 rounded-lg text-danger hover:bg-surface-muted transition-colors"
        >
          <FaRegTrashAlt
            className={`text-sm ${showHints ? "invisible" : ""}`}
          />
          {showHints && <Hint>⌫</Hint>}
        </button>
      </div>
    </div>
  );
}
