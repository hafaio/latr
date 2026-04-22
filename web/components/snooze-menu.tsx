"use client";

import { type ReactElement, useEffect, useRef, useState } from "react";
import { formatSnoozeTime } from "../utils/format";
import { getSnoozeOptions } from "../utils/snooze";

// Matches the defaults in `getSnoozeOptions`. When a preferences surface
// lands on web these should source from there.
const DEFAULT_MORNING_MINUTES = 480;
const DEFAULT_EVENING_MINUTES = 1200;

type CustomMode = "morning" | "evening" | "custom";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function parseTime(hhmm: string): number | null {
  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;
  const h = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default function SnoozeMenu({
  onPick,
  onClose,
}: {
  onPick: (epochMillis: number) => void;
  onClose: () => void;
}): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customDate, setCustomDate] = useState(() =>
    formatDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
  );
  const [customMode, setCustomMode] = useState<CustomMode>("morning");
  const [customTime, setCustomTime] = useState(() =>
    formatTime(DEFAULT_MORNING_MINUTES),
  );

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

  function pickedEpoch(): number | null {
    const d = new Date(`${customDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    let minutes: number;
    if (customMode === "morning") minutes = DEFAULT_MORNING_MINUTES;
    else if (customMode === "evening") minutes = DEFAULT_EVENING_MINUTES;
    else {
      const parsed = parseTime(customTime);
      if (parsed === null) return null;
      minutes = parsed;
    }
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    const epoch = d.getTime();
    if (epoch <= Date.now()) return null;
    return epoch;
  }

  const customEpoch = pickedEpoch();
  const minDate = formatDate(new Date());

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
                    type="date"
                    value={customDate}
                    min={minDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full text-sm bg-surface-muted rounded-lg px-3 py-2 text-text outline-none"
                  />
                  <div className="flex gap-1">
                    <CustomModeButton
                      label="Morning"
                      active={customMode === "morning"}
                      onClick={() => setCustomMode("morning")}
                    />
                    <CustomModeButton
                      label="Evening"
                      active={customMode === "evening"}
                      onClick={() => setCustomMode("evening")}
                    />
                    <CustomModeButton
                      label="Time"
                      active={customMode === "custom"}
                      onClick={() => setCustomMode("custom")}
                    />
                  </div>
                  {customMode === "custom" && (
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="w-full text-sm bg-surface-muted rounded-lg px-3 py-2 text-text outline-none"
                    />
                  )}
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
                      className="text-xs px-3 py-1.5 rounded-md bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:opacity-40"
                      disabled={customEpoch === null}
                      onClick={() => {
                        if (customEpoch !== null) onPick(customEpoch);
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

function CustomModeButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-1 text-xs px-2 py-1.5 rounded-md transition-colors
        ${active ? "bg-accent-soft text-accent font-medium" : "text-muted hover:bg-surface-hover"}
      `}
    >
      {label}
    </button>
  );
}
