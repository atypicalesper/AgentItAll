"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const nav = [
  { href: "/", label: "Dashboard", icon: "🏠", exact: true },
  { href: "/tasks", label: "Tasks", icon: "⚡" },
  { href: "/runs", label: "Run History", icon: "📋" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function Sidebar() {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      style={{
        width: collapsed ? 52 : 220,
        background: "var(--surface)",
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        padding: "24px 0",
        flexShrink: 0,
        transition: "width 0.2s ease",
        overflow: "hidden",
      }}
    >
      {/* Logo + collapse toggle */}
      <div style={{ padding: "0 12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {!collapsed && (
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "var(--accent)", letterSpacing: -0.5 }}>agentItAll</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>local AI agent dashboard</div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-muted)",
            fontSize: 16,
            padding: 4,
            borderRadius: 6,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {collapsed ? "▶" : "◀"}
        </button>
      </div>

      <nav style={{ flex: 1 }}>
        {nav.map(({ href, label, icon, exact }) => {
          const active = exact ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: collapsed ? 0 : 10,
                padding: collapsed ? "10px 0" : "10px 20px",
                justifyContent: collapsed ? "center" : "flex-start",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--accent)" : "var(--text-muted)",
                background: active ? "var(--surface2)" : "transparent",
                borderLeft: active ? "2px solid var(--accent)" : "2px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: collapsed ? 18 : 14 }}>{icon}</span>
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
