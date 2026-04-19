"use client";

import type { ReactElement } from "react";
import { FaAdjust, FaMoon, FaSun } from "react-icons/fa";
import { useTheme } from "./theme";

export default function ThemeButton(): ReactElement {
  const { theme, toggleTheme } = useTheme();
  const title =
    theme === undefined ? "System theme" : theme ? "Dark theme" : "Light theme";
  const icon =
    theme === undefined ? <FaAdjust /> : theme ? <FaMoon /> : <FaSun />;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={title}
      aria-label={title}
      className="p-2 rounded-md text-muted hover:bg-surface-hover hover:text-text transition-colors"
    >
      {icon}
    </button>
  );
}
