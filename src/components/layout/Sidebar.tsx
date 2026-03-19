"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  { href: "/tasks", label: "Tasks", icon: "⚡" },
  { href: "/runs", label: "Run History", icon: "📋" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const path = usePathname();

  return (
    <aside
      style={{
        width: 220,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 0",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "0 20px 28px" }}>
        <div style={{ fontWeight: 700, fontSize: 18, color: "var(--accent)", letterSpacing: -0.5 }}>
          agentItAll
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
          local AI agent dashboard
        </div>
      </div>

      <nav style={{ flex: 1 }}>
        {nav.map(({ href, label, icon }) => {
          const active = path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 20px",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--accent)" : "var(--text-muted)",
                background: active ? "var(--surface2)" : "transparent",
                borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              <span>{icon}</span>
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
