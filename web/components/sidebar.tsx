"use client";

import type { ReactElement } from "react";
import {
  FaAngleLeft,
  FaAngleRight,
  FaCheckCircle,
  FaListUl,
  FaRegCircle,
  FaRegClock,
} from "react-icons/fa";
import type { Filter } from "../utils/todo";
import AuthMenu from "./auth-menu";
import Logo from "./logo";
import ThemeButton from "./theme-button";

const TABS: { filter: Filter; label: string; icon: ReactElement }[] = [
  { filter: "ACTIVE", label: "Active", icon: <FaRegCircle /> },
  { filter: "SNOOZED", label: "Snoozed", icon: <FaRegClock /> },
  { filter: "DONE", label: "Done", icon: <FaCheckCircle /> },
  { filter: "ALL", label: "All", icon: <FaListUl /> },
];

export default function Sidebar({
  filter,
  onFilter,
  collapsed,
  onToggleCollapsed,
}: {
  filter: Filter;
  onFilter: (f: Filter) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}): ReactElement {
  return (
    <aside
      data-collapsed={collapsed}
      className="
        group/sidebar
        hidden md:flex flex-col
        fixed inset-y-0 left-0 z-20
        bg-surface-muted
        transition-[width] duration-200 ease-out
        w-56
        data-[collapsed=true]:w-14
        data-[collapsed=true]:hover:w-56
        overflow-hidden
      "
    >
      <div className="flex items-center justify-between px-3 h-14">
        <span className="flex items-center gap-2 px-1">
          <Logo className="w-6 h-6 shrink-0 text-accent" />
          <span className="font-semibold text-base tracking-tight group-data-[collapsed=true]/sidebar:group-hover/sidebar:inline group-data-[collapsed=true]/sidebar:hidden">
            latr
          </span>
        </span>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="p-1.5 rounded-md text-muted hover:bg-surface-hover hover:text-text transition-colors group-data-[collapsed=true]/sidebar:hidden group-data-[collapsed=true]/sidebar:group-hover/sidebar:block"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <FaAngleRight /> : <FaAngleLeft />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-1 space-y-0.5">
        {TABS.map(({ filter: f, label, icon }) => {
          const active = f === filter;
          return (
            <button
              key={f}
              type="button"
              onClick={() => onFilter(f)}
              className={`
                w-full flex items-center gap-3 px-2.5 h-8 rounded-md
                text-sm transition-colors
                ${active ? "bg-accent-soft text-accent font-medium" : "text-text hover:bg-surface-hover"}
              `}
            >
              <span className="w-5 h-5 shrink-0 flex items-center justify-center text-base">
                {icon}
              </span>
              <span className="truncate group-data-[collapsed=true]/sidebar:group-hover/sidebar:inline group-data-[collapsed=true]/sidebar:hidden">
                {label}
              </span>
            </button>
          );
        })}
      </nav>

      <div
        className="
          p-2 flex items-center justify-between gap-1
          group-data-[collapsed=true]/sidebar:flex-col
          group-data-[collapsed=true]/sidebar:group-hover/sidebar:flex-row
        "
      >
        <AuthMenu />
        <ThemeButton />
      </div>
    </aside>
  );
}
