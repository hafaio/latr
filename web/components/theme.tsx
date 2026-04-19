"use client";

import {
  createContext,
  type PropsWithChildren,
  type ReactElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

type ThemeContextValue = {
  theme: boolean | undefined;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: undefined,
  toggleTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

interface Matcher {
  matches: boolean;
  addEventListener(typ: "change", cb: () => void): void;
  removeEventListener(typ: "change", cb: () => void): void;
}

const defaultMatcher: Matcher = {
  matches: false,
  addEventListener() {},
  removeEventListener() {},
};

export default function ThemeProvider({
  children,
}: PropsWithChildren): ReactElement {
  const [theme, setTheme] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    function listener(): void {
      const stored = window.localStorage.getItem("theme");
      if (stored === "dark") setTheme(true);
      else if (stored === "light") setTheme(false);
      else {
        window.localStorage.removeItem("theme");
        setTheme(undefined);
      }
    }
    listener();
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);

  useEffect(() => {
    if (theme === undefined) window.localStorage.removeItem("theme");
    else if (theme) window.localStorage.setItem("theme", "dark");
    else window.localStorage.setItem("theme", "light");
  }, [theme]);

  const [matcher, setMatcher] = useState<Matcher>(defaultMatcher);
  useEffect(() => {
    setMatcher(window.matchMedia("(prefers-color-scheme: dark)"));
  }, []);

  const [dark, setDark] = useState(theme ?? matcher.matches);
  useEffect(() => {
    setDark(theme ?? matcher.matches);
    const cb = () => setDark(theme ?? matcher.matches);
    matcher.addEventListener("change", cb);
    return () => matcher.removeEventListener("change", cb);
  }, [matcher, theme]);

  useEffect(() => {
    if (dark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [dark]);

  const [toggled, setToggled] = useState(false);
  const toggleTheme = useCallback(() => {
    if (theme === undefined) setTheme(!matcher.matches);
    else if (toggled) {
      setTheme(undefined);
      setToggled(false);
    } else {
      setTheme(!theme);
      setToggled(true);
    }
  }, [theme, matcher.matches, toggled]);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
