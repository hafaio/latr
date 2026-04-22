"use client";

import { type ReactElement, useEffect, useRef, useState } from "react";
import { FaPlus } from "react-icons/fa";
import { isEditableTarget } from "../utils/keyboard";
import { useTodos } from "../utils/store";

export default function ComposeRow(): ReactElement {
  const { create, setFocus, setFilter } = useTodos();
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "n") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function submit() {
    const text = draft.trim();
    if (text.length === 0) {
      inputRef.current?.blur();
      return;
    }
    create(text);
    setFocus(null);
    setFilter("ACTIVE");
    setDraft("");
    // Keep focus on the compose input for fast-compose loop.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="group/compose flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface hover:bg-surface-hover transition-colors">
      <FaPlus className="text-muted shrink-0 text-sm" />
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        placeholder="Add a todo…"
        className="flex-1 min-w-0 bg-transparent outline-none text-text placeholder:text-muted py-1"
      />
      <kbd className="hidden sm:inline text-xs px-1.5 py-0.5 rounded-md bg-surface-muted text-muted font-sans group-focus-within/compose:hidden">
        n
      </kbd>
      <kbd className="hidden text-xs px-1.5 py-0.5 rounded-md bg-surface-muted text-muted font-sans group-focus-within/compose:sm:inline">
        ↵
      </kbd>
    </div>
  );
}
