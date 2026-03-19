"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case "g": router.push("/"); break;           // g = go to dashboard
        case "t": router.push("/tasks"); break;       // t = tasks
        case "r": router.push("/runs"); break;        // r = runs
        case "s": router.push("/settings"); break;    // s = settings
        case "n":
          // n = new task — dispatch custom event that TasksPage listens for
          window.dispatchEvent(new CustomEvent("shortcut:new-task"));
          router.push("/tasks");
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [router]);

  return null;
}
