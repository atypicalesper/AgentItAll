"use client";

import { useEffect } from "react";

export default function ThemeProvider() {
  useEffect(() => {
    const apply = (theme: string) => {
      document.documentElement.setAttribute("data-theme", theme);
    };

    // load from server config
    fetch("/api/config")
      .then((r) => r.json())
      .then((c) => apply(c.theme ?? "dark"))
      .catch(() => apply("dark"));

    // listen for theme changes from settings page
    const handler = (e: Event) => {
      const { theme } = (e as CustomEvent).detail;
      apply(theme);
    };
    window.addEventListener("theme-change", handler);
    return () => window.removeEventListener("theme-change", handler);
  }, []);

  return null;
}
