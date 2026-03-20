import { useState, useEffect } from "react";

const KEY = "selfdrop_dark_mode";

/**
 * Manages dark mode state.
 * Persists preference to localStorage.
 * Applies/removes 'dark' class on <html> element.
 */
export function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) return stored === "true";
    // Fall back to system preference
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem(KEY, String(dark));
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
