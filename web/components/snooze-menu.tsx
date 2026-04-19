"use client";

import { type ReactElement, useEffect, useRef, useState } from "react";
import { formatSnoozeTime } from "../utils/format";
import { getSnoozeOptions } from "../utils/snooze";

export default function SnoozeMenu({
  onPick,
  onClose,
}: {
  onPick: (epochMillis: number) => void;
  onClose: () => void;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const options = getSnoozeOptions(new Date());

  return (
    <div
      ref={rootRef}
      className="absolute z-30 right-0 mt-2 w-64 rounded-xl bg-surface border border-border shadow-xl overflow-hidden p-1"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      role="menu"
    >
      {options.map((opt) => {
        if (opt.kind === "Custom") {
          return (
            <div key="custom" className="mt-1 pt-1 border-t border-border">
              {customOpen ? (
                <div className="p-2 space-y-2">
                  <input
                    type="datetime-local"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    className="w-full text-sm bg-surface-muted rounded-lg px-3 py-2 text-text outline-none"
                  />
                  <div className="flex justify-end gap-1">
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md text-muted hover:bg-surface-hover transition-colors"
                      onClick={() => setCustomOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity"
                      onClick={() => {
                        const epoch = new Date(customValue).getTime();
                        if (!Number.isNaN(epoch)) onPick(epoch);
                      }}
                    >
                      Snooze
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCustomOpen(true)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-hover transition-colors"
                >
                  Pick a date &amp; time…
                </button>
              )}
            </div>
          );
        }
        return (
          <button
            key={opt.kind}
            type="button"
            onClick={() => onPick(opt.epochMillis)}
            className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-sm text-text hover:bg-surface-hover transition-colors"
          >
            <span>{opt.label}</span>
            <span className="text-xs text-muted">
              {formatSnoozeTime(opt.epochMillis)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
