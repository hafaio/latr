"use client";

import { type ReactElement, useEffect, useRef } from "react";
import { FaSearch } from "react-icons/fa";
import { isEditableTarget } from "../utils/keyboard";

export default function TopBar({
  search,
  onSearch,
}: {
  search: string;
  onSearch: (s: string) => void;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/") return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sticky top-0 z-10 bg-bg/90 backdrop-blur">
      <div
        className="
          max-w-2xl mx-auto px-4 sm:px-6 py-4
          md:ml-[max(var(--sidebar-reserved),calc((100vw-42rem)/2))]
          transition-[margin-left] duration-200 ease-out
        "
      >
        <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface-muted focus-within:bg-surface transition-colors">
          <FaSearch className="text-muted shrink-0 text-sm" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search"
            className="flex-1 bg-transparent outline-none text-text placeholder:text-muted text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearch("")}
              className="text-xs text-muted hover:text-text"
            >
              clear
            </button>
          )}
        </label>
      </div>
    </div>
  );
}
