"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Task, RunLog } from "@/lib/types";

const statusColor: Record<string, string> = {
  running: "var(--warning)",
  success: "var(--success)",
  failed: "var(--error)",
  cancelled: "var(--text-muted)",
};

function fmt(iso: string) {
  return new Date(iso).toLocaleString();
}

function duration(start: string, end?: string): string {
  const ms = new Date(end ?? new Date()).getTime() - new Date(start).getTime();
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [runs, setRuns] = useState<RunLog[]>([]);

  useEffect(() => {
    fetch("/api/tasks").then((r) => r.json()).then(setTasks);
    fetch("/api/runs").then((r) => r.json()).then(setRuns);
    const id = setInterval(() => {
      fetch("/api/runs").then((r) => r.json()).then(setRuns);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const completed = runs.filter((r) => r.status !== "running");
  const succeeded = runs.filter((r) => r.status === "success").length;
  const failed = runs.filter((r) => r.status === "failed").length;
  const running = runs.filter((r) => r.status === "running");
  const successRate = completed.length ? Math.round((succeeded / completed.length) * 100) : null;
  const recent = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 8);
  const totalTokens = runs.reduce((s, r) => s + (r.tokenUsage?.totalTokens ?? 0), 0);
  const pending = runs.filter((r) => r.approvalStatus === "pending");

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Dashboard</h1>
        <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>Overview of your agent activity</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 28 }}>
        {[
          { label: "Tasks", value: tasks.length, sub: `${tasks.filter(t => t.enabled).length} enabled`, href: "/tasks" },
          { label: "Total Runs", value: runs.length, sub: `${running.length} running`, href: "/runs" },
          { label: "Success Rate", value: successRate !== null ? `${successRate}%` : "—", sub: `${succeeded} succeeded`, color: successRate !== null && successRate < 50 ? "var(--error)" : "var(--success)" },
          { label: "Failed", value: failed, sub: "total failures", color: failed > 0 ? "var(--error)" : undefined },
          { label: "Tokens Used", value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens || "—", sub: "all time" },
          { label: "Pending Approval", value: pending.length, sub: "awaiting review", color: pending.length > 0 ? "var(--warning)" : undefined, href: pending.length ? `/runs/${pending[0].id}` : undefined },
        ].map((card) => (
          <div key={card.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{card.label}</div>
            {card.href
              ? <Link href={card.href} style={{ fontSize: 28, fontWeight: 700, color: card.color ?? "var(--text)", textDecoration: "none", display: "block" }}>{card.value}</Link>
              : <div style={{ fontSize: 28, fontWeight: 700, color: card.color ?? "var(--text)" }}>{card.value}</div>
            }
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Pending approvals banner */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "rgba(251,191,36,0.1)", border: "1px solid var(--warning)", borderRadius: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 18 }}>⏳</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{pending.length} run{pending.length > 1 ? "s" : ""} awaiting approval</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{pending.map(r => r.taskName).join(", ")}</div>
          </div>
          <Link href={`/runs/${pending[0].id}`} style={{ fontSize: 13, color: "var(--warning)", textDecoration: "none", border: "1px solid var(--warning)", borderRadius: 6, padding: "4px 12px" }}>Review →</Link>
        </div>
      )}

      {/* Active runs */}
      {running.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 10px" }}>Active</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {running.map((run) => (
              <Link key={run.id} href={`/runs/${run.id}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--warning)", boxShadow: "0 0 6px var(--warning)", flexShrink: 0 }} />
                <span style={{ fontWeight: 500, fontSize: 14, color: "var(--text)", flex: 1 }}>{run.taskName}</span>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{duration(run.startedAt)} elapsed</span>
                <span style={{ fontSize: 12, color: "var(--warning)", fontWeight: 600 }}>Live →</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Recent runs */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, margin: 0 }}>Recent Runs</h2>
          <Link href="/runs" style={{ fontSize: 13, color: "var(--accent)", textDecoration: "none" }}>View all →</Link>
        </div>
        {recent.length === 0
          ? <div style={{ color: "var(--text-muted)", fontSize: 14, padding: "40px 0", textAlign: "center" }}>No runs yet. <Link href="/tasks" style={{ color: "var(--accent)" }}>Create a task</Link> to get started.</div>
          : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recent.map((run) => (
                <Link key={run.id} href={`/runs/${run.id}`} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 16px", textDecoration: "none" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor[run.status], flexShrink: 0 }} />
                  <span style={{ fontWeight: 500, fontSize: 14, color: "var(--text)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{run.taskName}</span>
                  {run.approvalStatus === "pending" && <span style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600 }}>⏳ approval</span>}
                  {run.tokenUsage && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{run.tokenUsage.totalTokens.toLocaleString()} tok</span>}
                  <span style={{ fontSize: 11, color: statusColor[run.status], fontWeight: 600, textTransform: "uppercase" }}>{run.status}</span>
                  <span style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{fmt(run.startedAt)}</span>
                </Link>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}
