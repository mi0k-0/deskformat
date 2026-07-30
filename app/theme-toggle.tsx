"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const themeStorageKey = "deskformat-theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const savedTheme = window.localStorage.getItem(themeStorageKey);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    return savedTheme === "light" || savedTheme === "dark" ? savedTheme : prefersDark ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  return (
    <label className="floating-theme-switch">
      <input
        checked={theme === "dark"}
        onChange={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        type="checkbox"
      />
      <span>{theme === "dark" ? "Dark" : "Light"}</span>
    </label>
  );
}
