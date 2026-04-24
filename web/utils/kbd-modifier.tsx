"use client";

import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const Ctx = createContext(false);

/**
 * Tracks whether the platform command modifier (⌘ on macOS, Ctrl elsewhere)
 * is currently held down. Used to reveal letter hints over row actions and
 * to gate shortcut dispatch.
 */
export function ModifierProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const mac = /mac/i.test(navigator.platform);
    const key = mac ? "Meta" : "Control";
    function onDown(e: KeyboardEvent) {
      if (e.key === key) setHeld(true);
    }
    function onUp(e: KeyboardEvent) {
      if (e.key === key) setHeld(false);
    }
    function clear() {
      setHeld(false);
    }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", clear);
    document.addEventListener("visibilitychange", clear);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", clear);
      document.removeEventListener("visibilitychange", clear);
    };
  }, []);

  return <Ctx.Provider value={held}>{children}</Ctx.Provider>;
}

export function useModifierHeld(): boolean {
  return useContext(Ctx);
}
