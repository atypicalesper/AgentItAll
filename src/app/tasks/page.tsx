"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Task, RunLog } from "@/lib/types";
import TaskForm from "@/components/tasks/TaskForm";
import { getNextRun, formatTimeUntil, describeSchedule } from "@/lib/scheduleUtils";

const scheduleBadge = (task: Task) => {
  const s = task.schedule;
  if (!task.enabled) return { label: "Disabled", color: "var(--text-muted)" };
  if (s.kind === "manual") return { label: "Manual", color: "var(--text-muted)" };
  return { label: describeSchedule(s), color: s.kind === "hourly" ? "var(--warning)" : "var(--success)" };
};

const runStatusColor: Record<string, string> = {
  success: "var(--success)",
  failed: "var(--error)",
  cancelled: "var(--text-muted)",
};

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lastRuns, setLastRuns] = useState<Record<string, RunLog>>({});
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | undefined>();
  // map taskId → latest runId while running
  const [activeRuns, setActiveRuns] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/tasks").then((r) => r.json()).then(setTasks);
    fetch("/api/runs").then((r) => r.json()).then((d: { runs: RunLog[] } | RunLog[]) => {
      const runs = Array.isArray(d) ? d : d.runs;
      const map: Record<string, RunLog> = {};
      for (const run of runs) {
        if (!map[run.taskId] || run.startedAt > map[run.taskId].startedAt) {
          map[run.taskId] = run;
        }
      }
      setLastRuns(map);
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll runs for any active tasks to know when they finish
  useEffect(() => {
    if (Object.keys(activeRuns).length === 0) return;
    const id = setInterval(async () => {
      const updates: Record<string, string> = { ...activeRuns };
      let changed = false;
      for (const [taskId, runId] of Object.entries(activeRuns)) {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) continue;
        const run: RunLog = await res.json();
        if (run.status !== "running") {
          delete updates[taskId];
          changed = true;
        }
      }
      if (changed) setActiveRuns(updates);
    }, 3000);
    return () => clearInterval(id);
  }, [activeRuns]);

  const handleSave = async (data: Partial<Task>) => {
    try {
      if (editTask) {
        await fetch(`/api/tasks/${editTask.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      } else {
        await fetch("/api/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      }
      setShowForm(false);
      setEditTask(undefined);
      load();
    } catch {
      setError("Failed to save task.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    try {
      await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      load();
    } catch {
      setError("Failed to delete task.");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}/duplicate`, { method: "POST" });
      load();
    } catch {
      setError("Failed to duplicate task.");
    }
  };

  const handleRun = async (task: Task) => {
    try {
      setError(null);
      const res = await fetch("/api/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskId: task.id }) });
      if (!res.ok) throw new Error("Execute failed");
      const { runId } = await res.json();
      setActiveRuns((r) => ({ ...r, [task.id]: runId }));
    } catch {
      setError(`Failed to start task "${task.name}".`);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Tasks</h1>
          <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 14 }}>{tasks.length} task{tasks.length !== 1 ? "s" : ""}</p>
        </div>
        <button onClick={() => { setEditTask(undefined); setShowForm(true); }} style={primaryBtn}>+ New Task</button>
      </div>

      {error && (
        <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(248,113,113,0.1)", border: "1px solid var(--error)", borderRadius: 8, fontSize: 13, color: "var(--error)", display: "flex", justifyContent: "space-between" }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "var(--error)", cursor: "pointer" }}>✕</button>
        </div>
      )}

      {tasks.length === 0 && (
        <div style={{ textAlign: "center", padding: "80px 0", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
          <div style={{ fontSize: 16 }}>No tasks yet. Create your first task.</div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks…"
          style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 13, width: "100%", outline: "none" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {tasks.filter((t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.prompt.toLowerCase().includes(search.toLowerCase())).map((task) => {
          const { label, color } = scheduleBadge(task);
          const runId = activeRuns[task.id];
          const isRunning = !!runId;
          const lastRun = lastRuns[task.id];

          return (
            <div key={task.id} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "18px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <Link href={`/tasks/${task.id}`} style={{ fontWeight: 600, fontSize: 15, color: "var(--text)", textDecoration: "none" }}>
                    {task.name}
                  </Link>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--surface2)", color, fontWeight: 600 }}>{label}</span>
                  {task.enabled && task.schedule.kind !== "manual" && (() => { const next = getNextRun(task.schedule); return next ? <span style={{ fontSize: 11, color: "var(--text-muted)" }}>in {formatTimeUntil(next)}</span> : null; })()}
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{task.model.split("-").slice(1, 3).join("-")}</span>
                  {lastRun && !isRunning && (
                    <Link href={`/runs/${lastRun.id}`} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--surface2)", color: runStatusColor[lastRun.status] ?? "var(--text-muted)", fontWeight: 600, textDecoration: "none" }}>
                      {lastRun.status === "success" ? "✓" : lastRun.status === "failed" ? "✗" : "—"} last run
                    </Link>
                  )}
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "60ch" }}>{task.prompt}</p>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {task.repos.map((r) => <span key={r} style={{ fontSize: 11, padding: "2px 8px", background: "var(--surface2)", borderRadius: 8, color: "var(--text-muted)" }}>{r.split("/").pop()}</span>)}
                  {task.permissions.commit && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(124,110,247,0.1)", borderRadius: 8, color: "var(--accent)" }}>commit</span>}
                  {task.permissions.push && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(124,110,247,0.1)", borderRadius: 8, color: "var(--accent)" }}>push</span>}
                  {task.permissions.runCommands && <span style={{ fontSize: 11, padding: "2px 8px", background: "rgba(124,110,247,0.1)", borderRadius: 8, color: "var(--accent)" }}>run cmds</span>}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
                {isRunning ? (
                  <>
                    <span style={{ fontSize: 13, color: "var(--warning)", display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--warning)", display: "inline-block", animation: "pulse 1.5s infinite" }} />
                      Running…
                    </span>
                    <Link href={`/runs/${runId}`} style={{ ...secondaryBtn, fontSize: 13, textDecoration: "none", display: "flex", alignItems: "center" }}>View Live Log</Link>
                  </>
                ) : (
                  <button onClick={() => handleRun(task)} style={{ ...primaryBtn, fontSize: 13 }}>▶ Run</button>
                )}
                <button onClick={() => { setEditTask(task); setShowForm(true); }} style={secondaryBtn}>Edit</button>
                <button onClick={() => handleDuplicate(task.id)} style={secondaryBtn}>Copy</button>
                <button onClick={() => handleDelete(task.id)} style={{ ...secondaryBtn, color: "var(--error)", borderColor: "transparent" }}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>

      {showForm && (
        <TaskForm
          task={editTask}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditTask(undefined); }}
        />
      )}
    </div>
  );
}

const primaryBtn: React.CSSProperties = { background: "var(--accent)", color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: "pointer" };
const secondaryBtn: React.CSSProperties = { background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 14px", fontSize: 14, cursor: "pointer" };
