"use client";

import { useEffect, useState } from "react";
import {
  nextTheme,
  storedTheme,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
  type SiteTheme,
} from "./theme";

function effectiveTheme(media: MediaQueryList): SiteTheme {
  return (
    storedTheme(document.documentElement.dataset.theme) ??
    (media.matches ? "dark" : "light")
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<SiteTheme | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setTheme(effectiveTheme(media));
    const syncSystemTheme = () => {
      if (!storedTheme(document.documentElement.dataset.theme)) sync();
    };

    sync();
    media.addEventListener("change", syncSystemTheme);
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => {
      media.removeEventListener("change", syncSystemTheme);
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
    };
  }, []);

  function toggleTheme() {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const next = nextTheme(
      document.documentElement.dataset.theme,
      media.matches
    );
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
    setTheme(next);
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: next } })
    );
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label="Switch color theme"
      data-active-theme={theme ?? undefined}
      onClick={toggleTheme}
      suppressHydrationWarning
    >
      <svg
        className="theme-icon theme-icon-moon"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path d="M15.8 12.7A6.5 6.5 0 0 1 7.3 4.2 6.5 6.5 0 1 0 15.8 12.7Z" />
      </svg>
      <svg
        className="theme-icon theme-icon-sun"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="3.25" />
        <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" />
      </svg>
      <span className="visually-hidden">Theme</span>
    </button>
  );
}
